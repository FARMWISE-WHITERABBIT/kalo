-- M3 (items 1-2) + hamburger-menu backing RPCs: daily faucet economy,
-- PnL leaderboard, and a public system-status endpoint. What and why:
--
-- Faucet (§8.1): faucet_claims + claim_faucet(). One claim per 20h; claiming
-- again within 48h extends a streak that raises the amount (100 base, +25
-- per consecutive day, capped at 275). Mints flow through grant_play_money
-- so I1 holds. Per-user advisory lock prevents double-claim races. Bots and
-- the treasury cannot claim.
--
-- Leaderboard (§8.2): leaderboard() ranks by PnL, not balance. PnL is
-- computed as (current equity) - (total minted to the user), where equity =
-- cash + positions marked to the last traded price (resolved markets mark
-- winners at 1, losers at 0) + open-order escrow marked the same way. This
-- identity equals realized + mark-to-market PnL without needing cost-basis
-- accounting. Bots are included but flagged so the UI can badge them; the
-- treasury is excluded. All-time only for now — weekly needs equity
-- snapshots, which land with the price-history infra (§8.4).
--
-- Status: system_status() exposes safe aggregates (markets, 24h activity,
-- last invariant verification) so /status can show real engine health
-- without opening the operator tables.

-- ── faucet ──────────────────────────────────────────────────────────────

create table public.faucet_claims (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric(14, 4) not null,
  streak int not null,
  claimed_at timestamptz not null default now()
);
create index faucet_claims_user_idx on public.faucet_claims (user_id, claimed_at desc);
alter table public.faucet_claims enable row level security;
create policy "own claims readable" on public.faucet_claims for select using (auth.uid() = user_id);

create or replace function public.claim_faucet()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_last record;
  v_streak int := 1;
  v_amount numeric;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if exists (select 1 from public.bot_traders where user_id = v_user)
     or v_user = public.treasury_id() then
    raise exception 'system accounts cannot claim';
  end if;

  -- serialize per user so a double-click cannot double-claim
  perform pg_advisory_xact_lock(hashtext('faucet:' || v_user::text));

  select * into v_last from public.faucet_claims
    where user_id = v_user order by claimed_at desc limit 1;
  if found then
    if v_last.claimed_at > now() - interval '20 hours' then
      raise exception 'already claimed — come back tomorrow';
    end if;
    if v_last.claimed_at > now() - interval '48 hours' then
      v_streak := least(v_last.streak + 1, 30);
    end if;
  end if;

  v_amount := 100 + least(v_streak - 1, 7) * 25;

  insert into public.faucet_claims (user_id, amount, streak)
    values (v_user, v_amount, v_streak);
  perform public.grant_play_money(v_user, v_amount, 'faucet_claim');

  return jsonb_build_object('amount', v_amount, 'streak', v_streak);
end;
$$;

-- ── leaderboard ─────────────────────────────────────────────────────────

create or replace function public.leaderboard(p_limit int default 25)
returns table (display_name text, is_bot boolean, pnl numeric, volume numeric)
language sql
security definer
set search_path = public
stable
as $$
  with marks as (
    select distinct on (t.market_id) t.market_id,
           case when t.outcome = 'YES' then t.price else 1 - t.price end as yes_mark
    from public.trades t
    where not t.is_seed
    order by t.market_id, t.created_at desc
  ),
  pos_val as (
    select p.user_id,
           sum(p.shares * case
             when m.status = 'resolved' then
               case when p.outcome = m.resolved_outcome then 1 else 0 end
             when p.outcome = 'YES' then coalesce(k.yes_mark, 0.5)
             else 1 - coalesce(k.yes_mark, 0.5)
           end) as v
    from public.positions p
    join public.markets m on m.id = p.market_id
    left join marks k on k.market_id = p.market_id
    group by p.user_id
  ),
  escrow_val as (
    select o.user_id,
           sum(case
             when o.side = 'BUY' then o.price * (o.size - o.filled_size)
             when o.outcome = 'YES' then (o.size - o.filled_size) * coalesce(k.yes_mark, 0.5)
             else (o.size - o.filled_size) * (1 - coalesce(k.yes_mark, 0.5))
           end) as v
    from public.orders o
    left join marks k on k.market_id = o.market_id
    where o.status in ('open', 'partial')
    group by o.user_id
  ),
  minted as (
    select user_id, sum(amount) as v from public.mint_ledger
    where user_id is not null group by user_id
  ),
  traded as (
    select ou.user_id, sum(t.price * t.size) as v
    from public.trades t
    join lateral (
      select user_id from public.orders where id = t.taker_order_id
      union all
      select user_id from public.orders where id = t.maker_order_id
    ) ou on true
    where not t.is_seed
    group by ou.user_id
  )
  select pr.display_name,
         exists (select 1 from public.bot_traders b where b.user_id = pr.id) as is_bot,
         round(pr.balance + coalesce(pv.v, 0) + coalesce(ev.v, 0) - coalesce(mi.v, 0), 2) as pnl,
         round(coalesce(tv.v, 0), 2) as volume
  from public.profiles pr
  left join pos_val pv on pv.user_id = pr.id
  left join escrow_val ev on ev.user_id = pr.id
  left join minted mi on mi.user_id = pr.id
  left join traded tv on tv.user_id = pr.id
  where pr.id <> public.treasury_id()
  order by pnl desc
  limit least(greatest(p_limit, 1), 100);
$$;

-- ── status ──────────────────────────────────────────────────────────────

create or replace function public.system_status()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'markets_open', (select count(*) from public.markets where status = 'open'),
    'markets_total', (select count(*) from public.markets),
    'trades_24h', (select count(*) from public.trades where created_at > now() - interval '24 hours' and not is_seed),
    'volume_24h', (select coalesce(sum(price * size), 0) from public.trades where created_at > now() - interval '24 hours' and not is_seed),
    'trades_15m', (select count(*) from public.trades where created_at > now() - interval '15 minutes' and not is_seed),
    'traders', (select count(*) from public.profiles),
    'invariants', (
      select jsonb_build_object('ok', r.ok, 'checked_at', r.ran_at)
      from public.invariant_runs r order by r.ran_at desc limit 1
    ),
    'checked_at', now()
  );
$$;

grant execute on function public.claim_faucet() to authenticated;
grant execute on function public.leaderboard(int) to authenticated, anon;
grant execute on function public.system_status() to authenticated, anon;
