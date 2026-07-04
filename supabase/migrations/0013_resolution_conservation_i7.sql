-- I7: resolution conservation. Adapted from an external audit whose core
-- insight is right and whose patch targeted stale code — reconciliation:
--
-- WHAT THE AUDIT FOUND (against resolve_market v2, pre-0011): I1's collateral
-- term for a resolved market counts only unredeemed WINNING shares, so the
-- invariant stops observing the losing side at resolution, and a deferred
-- redemption path validates payouts against the same post-redemption state
-- they mutate. Also: redeem_market v1 raised for holders of only losing
-- shares, leaving dead position rows no code path could clear.
--
-- WHAT IS ALREADY TRUE IN THIS REPO (0011): resolve_market v3 auto-redeems —
-- payout and collateral release happen in ONE transaction, so I1 does catch
-- double-credit/missed-burn at resolution (cash and collateral co-move).
-- There are no deferred redemptions and no legacy resolved markets.
--
-- WHAT I7 STILL ADDS:
--   * an external anchor: open interest is frozen into market_resolution
--     BEFORE the payout loop runs, measured from the YES side; payouts are
--     accumulated from the WINNING side. The assertion
--         open_interest = redeemed_to_winners + unredeemed_winning_shares
--     therefore checks the payout against a number it did not produce, and
--     the cross-sided measurement also catches I2-violating payouts.
--   * regression insurance: if deferred redemption ever returns (the
--     redeem_market parity path, §6.4), its accounting is already anchored.
--   * an auditable per-market resolution record (feeds redemption history
--     and the accuracy page).
--
-- SECONDARY FIX (redeem_market v2): settle-any-holder semantics — winners
-- burn for $1 each (recorded in the snapshot), losing shares burn for $0,
-- nothing raises, calling twice is a no-op. Takes the market advisory lock,
-- which v1 never did.

-- ── snapshot: frozen at resolution, payouts accumulated against it ───────

create table public.market_resolution (
  market_id uuid primary key references public.markets (id) on delete cascade,
  resolved_outcome text not null check (resolved_outcome in ('YES', 'NO')),
  -- collateralised pair count at resolution, measured post-flush, pre-payout
  open_interest numeric(20, 4) not null,
  redeemed_to_winners numeric(20, 4) not null default 0,
  resolved_at timestamptz not null default now()
);
alter table public.market_resolution enable row level security;
-- aggregate, non-sensitive: publicly readable (a grant without a policy
-- would be dead under RLS)
create policy "resolutions are publicly readable"
  on public.market_resolution for select using (true);
grant select on public.market_resolution to authenticated, anon;

-- ── resolve_market v4: v3's auto-redemption + the I7 snapshot ────────────

create or replace function public.resolve_market(p_market_id uuid, p_outcome text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_pos record;
  v_oi numeric;
  v_paid numeric := 0;
begin
  if not exists (select 1 from public.profiles where id = v_user and is_admin) then
    raise exception 'admin only';
  end if;
  if p_outcome not in ('YES', 'NO') then
    raise exception 'invalid outcome';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_market_id::text));

  if not exists (select 1 from public.markets where id = p_market_id and status in ('open', 'closed')) then
    raise exception 'market not resolvable';
  end if;

  perform public.flush_market_orders(p_market_id);

  -- I7 anchor: open interest AFTER flush, BEFORE any payout. Measured from
  -- the YES side regardless of verdict; equals the winning-side count iff I2
  -- held, so a lopsided payout breaks the equality below.
  select coalesce(sum(shares), 0) into v_oi
    from public.positions where market_id = p_market_id and outcome = 'YES';

  update public.markets set status = 'resolved', resolved_outcome = p_outcome where id = p_market_id;

  -- auto-redemption (§6.4): winners credited $1/share immediately
  for v_pos in
    select user_id, shares from public.positions
      where market_id = p_market_id and outcome = p_outcome and shares > 0
      for update
  loop
    update public.profiles set balance = balance + v_pos.shares where id = v_pos.user_id;
    v_paid := v_paid + v_pos.shares;
  end loop;
  update public.positions set shares = 0 where market_id = p_market_id;

  insert into public.market_resolution (market_id, resolved_outcome, open_interest, redeemed_to_winners)
    values (p_market_id, p_outcome, v_oi, v_paid);
end;
$$;

-- ── redeem_market v2: parity path — settle any holder, idempotently ─────

create or replace function public.redeem_market(p_market_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_outcome text;
  v_lose text;
  v_win numeric;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_market_id::text));

  select resolved_outcome into v_outcome
    from public.markets where id = p_market_id and status = 'resolved';
  if v_outcome is null then
    raise exception 'market not resolved';
  end if;
  v_lose := case when v_outcome = 'YES' then 'NO' else 'YES' end;

  select coalesce(shares, 0) into v_win
    from public.positions
    where user_id = v_user and market_id = p_market_id and outcome = v_outcome
    for update;

  if coalesce(v_win, 0) > 0 then
    update public.positions set shares = 0
      where user_id = v_user and market_id = p_market_id and outcome = v_outcome;
    update public.profiles set balance = balance + v_win where id = v_user;
    update public.market_resolution
      set redeemed_to_winners = redeemed_to_winners + v_win
      where market_id = p_market_id;
  end if;

  -- losing shares settle for $0; clear them so no dead rows linger.
  -- Nothing raises: settling an empty position is a no-op, not an error.
  update public.positions set shares = 0
    where user_id = v_user and market_id = p_market_id and outcome = v_lose and shares > 0;
end;
$$;

grant execute on function public.resolve_market(uuid, text) to authenticated;
grant execute on function public.redeem_market(uuid) to authenticated;

-- ── I7 check + invariant_report v3 ──────────────────────────────────────

create or replace function public.i7_violations()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'market_id', v.market_id,
    'open_interest', v.open_interest,
    'redeemed', v.redeemed_to_winners,
    'unredeemed_winning', v.unredeemed_winning,
    'delta', v.open_interest - (v.redeemed_to_winners + v.unredeemed_winning)
  )), '[]'::jsonb)
  from (
    select r.market_id, r.open_interest, r.redeemed_to_winners,
      (select coalesce(sum(p.shares), 0) from public.positions p
        where p.market_id = r.market_id and p.outcome = r.resolved_outcome) as unredeemed_winning
    from public.market_resolution r
  ) v
  where v.open_interest <> (v.redeemed_to_winners + v.unredeemed_winning);
$$;
revoke execute on function public.i7_violations() from public, anon, authenticated;

create or replace function public.invariant_report()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_minted numeric;
  v_cash numeric;
  v_escrow numeric;
  v_collateral numeric;
  v_i1_delta numeric;
  v_i2 jsonb;
  v_i3_bal int;
  v_i3_pos int;
  v_i3_ord int;
  v_i6 int;
  v_i7 jsonb;
  v_ok boolean;
begin
  select coalesce(sum(amount), 0) into v_minted from public.mint_ledger;
  select cash, buy_escrow, collateral into v_cash, v_escrow, v_collateral from public.engine_totals();
  v_i1_delta := (v_cash + v_escrow + v_collateral) - v_minted;

  select coalesce(jsonb_agg(jsonb_build_object(
           'market_id', x.market_id, 'yes_total', x.yes_total, 'no_total', x.no_total)), '[]'::jsonb)
    into v_i2
    from (
      select m.id as market_id,
        (select coalesce(sum(p.shares), 0) from public.positions p
          where p.market_id = m.id and p.outcome = 'YES')
        + (select coalesce(sum(o.size - o.filled_size), 0) from public.orders o
            where o.market_id = m.id and o.status in ('open', 'partial')
              and o.side = 'SELL' and o.outcome = 'YES') as yes_total,
        (select coalesce(sum(p.shares), 0) from public.positions p
          where p.market_id = m.id and p.outcome = 'NO')
        + (select coalesce(sum(o.size - o.filled_size), 0) from public.orders o
            where o.market_id = m.id and o.status in ('open', 'partial')
              and o.side = 'SELL' and o.outcome = 'NO') as no_total
      from public.markets m
      where m.status in ('open', 'closed')
    ) x
    where x.yes_total <> x.no_total;

  select count(*) into v_i3_bal from public.profiles where balance < 0;
  select count(*) into v_i3_pos from public.positions where shares < 0;
  select count(*) into v_i3_ord from public.orders where filled_size > size or size <= 0;
  select count(*) into v_i6 from public.trades
    where not is_seed and (taker_order_id is null or maker_order_id is null);

  v_i7 := public.i7_violations();

  v_ok := v_i1_delta = 0
      and v_i2 = '[]'::jsonb
      and v_i3_bal = 0 and v_i3_pos = 0 and v_i3_ord = 0
      and v_i6 = 0
      and v_i7 = '[]'::jsonb;

  return jsonb_build_object(
    'ok', v_ok,
    'checked_at', now(),
    'i1', jsonb_build_object('minted', v_minted, 'cash', v_cash,
            'buy_escrow', v_escrow, 'collateral', v_collateral,
            'delta', v_i1_delta, 'ok', v_i1_delta = 0),
    'i2', jsonb_build_object('violations', v_i2, 'ok', v_i2 = '[]'::jsonb),
    'i3', jsonb_build_object('negative_balances', v_i3_bal,
            'negative_positions', v_i3_pos, 'bad_orders', v_i3_ord,
            'ok', v_i3_bal = 0 and v_i3_pos = 0 and v_i3_ord = 0),
    'i6', jsonb_build_object('uncollateralized_trades', v_i6, 'ok', v_i6 = 0),
    'i7', jsonb_build_object('violations', v_i7, 'ok', v_i7 = '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.invariant_report() from public, anon, authenticated;

-- ── backfill ─────────────────────────────────────────────────────────────
-- Zero resolved markets exist at migration time (verified), so this is a
-- no-op today; kept so the migration is correct if replayed against an
-- environment that resolved markets under 0011 (auto-redeemed: positions
-- zeroed, payouts made). For those, OI and payouts are unrecoverable, so
-- seed both sides equal (current winning shares, redeemed 0): I7 holds by
-- construction for legacy rows and has real teeth only for new resolutions.
insert into public.market_resolution (market_id, resolved_outcome, open_interest, redeemed_to_winners, resolved_at)
select m.id, m.resolved_outcome,
  (select coalesce(sum(p.shares), 0) from public.positions p
    where p.market_id = m.id and p.outcome = m.resolved_outcome),
  0, m.created_at
from public.markets m
where m.status = 'resolved' and m.resolved_outcome is not null
on conflict (market_id) do nothing;
