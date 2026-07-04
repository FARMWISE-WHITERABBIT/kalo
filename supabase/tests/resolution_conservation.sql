-- I7 resolution-conservation suite (migration 0013), including the negative
-- tests that prove the invariant FIRES — an invariant that cannot go red is
-- decoration, so both corruption vectors are exercised and restored.

do $$
declare
  u1 uuid := kalo_test.mk_user('i7_u1');
  u2 uuid := kalo_test.mk_user('i7_u2');
  m1 uuid := kalo_test.mk_market('i7 auto-redeem market');
  m2 uuid := kalo_test.mk_market('i7 parity market');
  r jsonb;
  snap record;
  bal numeric;
begin
  -- ================= scenario 1: auto-redeem path snapshots correctly ====
  perform kalo_test.act_as(u1);
  perform public.place_order(m1, 'YES', 'BUY', 0.60, 50);
  perform kalo_test.act_as(u2);
  perform public.place_order(m1, 'NO', 'BUY', 0.40, 50);   -- mint 50 pairs

  update public.profiles set is_admin = true where id = u2;
  perform kalo_test.act_as(u2);
  select balance into bal from public.profiles where id = u1;
  perform public.resolve_market(m1, 'YES');

  select * into snap from public.market_resolution where market_id = m1;
  perform kalo_test.check(snap.open_interest = 50 and snap.redeemed_to_winners = 50,
    's1: snapshot froze OI=50 pre-payout and recorded 50 paid');
  perform kalo_test.check(
    (select balance from public.profiles where id = u1) = bal + 50,
    's1: winner auto-credited 50');
  r := public.invariant_report();
  perform kalo_test.check((r->'i7'->>'ok')::boolean and (r->>'ok')::boolean,
    's1: I7 green after auto-redeem resolution');

  -- ================= scenario 2: deferred/parity path =====================
  -- simulate a pre-auto-redeem resolution: pairs exist, market flips resolved
  -- with a snapshot but NO payout (what a deferred-redemption engine does)
  perform kalo_test.act_as(u1);
  perform public.place_order(m2, 'YES', 'BUY', 0.60, 40);
  perform kalo_test.act_as(u2);
  perform public.place_order(m2, 'NO', 'BUY', 0.40, 40);   -- mint 40 pairs

  update public.markets set status = 'resolved', resolved_outcome = 'YES' where id = m2;
  insert into public.market_resolution (market_id, resolved_outcome, open_interest, redeemed_to_winners)
    values (m2, 'YES', 40, 0);

  r := public.invariant_report();
  perform kalo_test.check((r->'i7'->>'ok')::boolean,
    's2: I7 green with 40 unredeemed winning shares outstanding');

  -- winner redeems through the parity path: paid, recorded in the snapshot
  perform kalo_test.act_as(u1);
  select balance into bal from public.profiles where id = u1;
  perform public.redeem_market(m2);
  perform kalo_test.check(
    (select balance from public.profiles where id = u1) = bal + 40,
    's2: parity redeem paid the winner 40');
  perform kalo_test.check(
    (select redeemed_to_winners from public.market_resolution where market_id = m2) = 40,
    's2: parity redeem recorded against the frozen snapshot');

  -- loser-only holder: v1 raised here; v2 settles as a no-op and clears rows
  perform kalo_test.act_as(u2);
  select balance into bal from public.profiles where id = u2;
  perform public.redeem_market(m2);
  perform kalo_test.check(
    (select balance from public.profiles where id = u2) = bal,
    's2: loser redeem is a no-op on balance (no raise)');
  perform kalo_test.check(
    not exists (select 1 from public.positions where market_id = m2 and shares > 0),
    's2: no dead position rows linger after both sides settle');
  perform public.redeem_market(m2);  -- idempotent second call
  r := public.invariant_report();
  perform kalo_test.check((r->'i7'->>'ok')::boolean and (r->'i1'->>'ok')::boolean,
    's2: I7 and I1 green after full parity settlement');

  -- ================= scenario 3: NEGATIVE — prove I7 fires ================
  -- corruption vector A: understate recorded payouts (as a double-credit
  -- that hid itself would)
  update public.market_resolution set redeemed_to_winners = redeemed_to_winners - 5
    where market_id = m1;
  r := public.invariant_report();
  perform kalo_test.check(not (r->'i7'->>'ok')::boolean and not (r->>'ok')::boolean,
    's3a: I7 fires on payout-ledger corruption (delta 5)');
  update public.market_resolution set redeemed_to_winners = redeemed_to_winners + 5
    where market_id = m1;

  -- corruption vector B: winning shares reappear after resolution
  update public.positions set shares = 7
    where market_id = m1 and user_id = u1 and outcome = 'YES';
  r := public.invariant_report();
  perform kalo_test.check(not (r->'i7'->>'ok')::boolean,
    's3b: I7 fires on post-resolution share resurrection');
  update public.positions set shares = 0
    where market_id = m1 and user_id = u1 and outcome = 'YES';

  -- corroborate I1's own teeth on a raw double-credit
  update public.profiles set balance = balance + 50 where id = u1;
  r := public.invariant_report();
  perform kalo_test.check(not (r->'i1'->>'ok')::boolean,
    's3c: I1 fires on a raw double-credit (delta +50)');
  update public.profiles set balance = balance - 50 where id = u1;

  r := public.invariant_report();
  perform kalo_test.check((r->>'ok')::boolean, 's3: all green after restorations');

  perform set_config('request.jwt.claims', '', true);
  raise notice 'resolution_conservation: ALL CHECKS PASSED, negatives fired';
end;
$$;
