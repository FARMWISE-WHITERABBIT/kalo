#!/usr/bin/env bash
# Deterministic test for the resolve/place race that pg_advisory_xact_lock
# (P0-6) closes. Random HFT load exercises the matching path, not this
# adversarial interleaving — an order landing between resolve's flush loop
# and its status flip — so the window must be forced with two real sessions.
#
# METHOD
#   Session A: BEGIN; take the market's advisory lock; run the exact body of
#   resolve_market v4 (flush -> OI snapshot -> status flip -> payout) with a
#   3s sleep inside the gap; COMMIT.
#   Session B: concurrently calls place_order on the same market.
#
#   PASS: B blocks on the advisory lock until A commits, then sees
#   status='resolved' and is rejected ("market is not open"). No order rests,
#   no escrow moves, I1 delta stays 0, I7 green.
#
#   The unlocked control (prove the lock is load-bearing): re-run with
#   LOCK=off on a FRESH seed — B's order then rests on a market that
#   resolves underneath it. Escrow is still I1-accounted (cancellable), so
#   the observable damage is residue: an open order on a resolved market,
#   which the residue check below catches.
#
# REQUIREMENTS
#   * DATABASE_URL to a DISPOSABLE stack (this commits test rows; it cleans
#     up after itself but do not aim it at production data).
#   * psql. Auth spoofing uses set_config on both request.jwt.claims and
#     request.jwt.claim.sub, matching how auth.uid() resolves in Supabase.
#
# USAGE
#   DATABASE_URL=postgres://... ./concurrency_resolve_race.sh          # locked (PASS expected)
#   DATABASE_URL=postgres://... LOCK=off ./concurrency_resolve_race.sh # control (residue expected)

set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL to a disposable Postgres/Supabase stack}"
LOCK="${LOCK:-on}"
RUN="race_$RANDOM$RANDOM"

q() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qtA -c "$1"; }

echo "── seeding market + two funded users ($RUN) ──"
MKT=$(q "insert into public.markets (question, category, status, close_at)
         values ('$RUN probe', 'Test', 'open', now() + interval '1 day')
         returning id;")
mk_user() {
  q "insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       confirmation_token, recovery_token, email_change_token_new, email_change)
     values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
       'authenticated', '$RUN-$1@test.kalo.local', '!test!', now(),
       '{\"provider\":\"email\",\"providers\":[\"email\"]}'::jsonb,
       jsonb_build_object('display_name', '$RUN-$1'), now(), now(), '', '', '', '')
     returning id;"
}
UID_A=$(mk_user a)   # admin / resolver
UID_B=$(mk_user b)   # order placer
q "update public.profiles set is_admin = true where id = '$UID_A';"
q "select public.grant_play_money('$UID_B'::uuid, 1000, 'test_race');" >/dev/null
# give the market real open interest so resolution has something to pay
q "select set_config('request.jwt.claims', json_build_object('sub','$UID_A','role','authenticated')::text, false),
         public.grant_play_money('$UID_A'::uuid, 1000, 'test_race'),
         public.place_order('$MKT','YES','BUY',0.60,20);" >/dev/null
q "select set_config('request.jwt.claims', json_build_object('sub','$UID_B','role','authenticated')::text, false),
         public.place_order('$MKT','NO','BUY',0.40,20);" >/dev/null

BASE=$(q "select (public.invariant_report()->'i1'->>'delta');" || echo "n/a")
echo "baseline I1 delta: $BASE (expect 0)"

LOCK_SQL=""
[ "$LOCK" = "on" ] && LOCK_SQL="perform pg_advisory_xact_lock(hashtext('$MKT'::text));"

echo "── session A enters the resolve gap (lock=$LOCK, 3s) ──"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<SQL &
begin;
do \$\$
declare v_oi numeric; v_paid numeric := 0; v_pos record;
begin
  $LOCK_SQL
  perform public.flush_market_orders('$MKT');
  select coalesce(sum(shares),0) into v_oi
    from public.positions where market_id='$MKT' and outcome='YES';
  perform pg_sleep(3);   -- the gap
  update public.markets set status='resolved', resolved_outcome='YES' where id='$MKT';
  for v_pos in select user_id, shares from public.positions
      where market_id='$MKT' and outcome='YES' and shares > 0 for update loop
    update public.profiles set balance = balance + v_pos.shares where id = v_pos.user_id;
    v_paid := v_paid + v_pos.shares;
  end loop;
  update public.positions set shares = 0 where market_id='$MKT';
  insert into public.market_resolution (market_id, resolved_outcome, open_interest, redeemed_to_winners)
    values ('$MKT','YES', v_oi, v_paid);
end \$\$;
commit;
SQL
A_PID=$!
sleep 1   # ensure A is inside the gap before B fires

echo "── session B fires place_order into the gap ──"
set +e
B_OUT=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qtA <<SQL 2>&1
select set_config('request.jwt.claims', json_build_object('sub','$UID_B','role','authenticated')::text, false),
       set_config('request.jwt.claim.sub', '$UID_B', false);
select public.place_order('$MKT','YES','BUY', 0.50, 10);
SQL
)
B_RC=$?
set -e
wait "$A_PID"
echo "   B exit=$B_RC output: $(echo "$B_OUT" | tail -1)"

DELTA=$(q "select (public.invariant_report()->'i1'->>'delta');")
I7=$(q "select (public.invariant_report()->'i7'->>'ok');")
RESIDUE=$(q "select count(*) from public.orders
             where market_id='$MKT' and status in ('open','partial');")
echo "   I1 delta: $DELTA · I7 ok: $I7 · resting orders on resolved market: $RESIDUE"

echo "── cleanup ──"
q "delete from public.markets where id = '$MKT';" >/dev/null
q "delete from auth.users where id in ('$UID_A','$UID_B');" >/dev/null

echo "════════════════════════════════════════════"
if [ "$LOCK" = "on" ]; then
  if [ "$B_RC" -ne 0 ] && [ "$DELTA" = "0" ] && [ "$RESIDUE" = "0" ]; then
    echo "PASS: B serialized behind resolution, was rejected, left no residue."
  else
    echo "FAIL: lock did not close the race (B rc=$B_RC delta=$DELTA residue=$RESIDUE)."
    exit 1
  fi
else
  if [ "$RESIDUE" != "0" ]; then
    echo "CONTROL CONFIRMED: without the lock, an order rested on a resolved"
    echo "market (residue=$RESIDUE) — the lock is load-bearing."
  else
    echo "CONTROL INCONCLUSIVE: interleaving not hit; re-run (timing-dependent)."
  fi
fi
