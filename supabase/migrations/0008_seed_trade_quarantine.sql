-- M1: P0-5 seed-data quarantine. What changed and why:
--
-- bot_backfill (0003) inserted cosmetic, uncollateralized price history
-- directly into trades, violating I6 (every trades row must correspond to a
-- real collateralized settlement). Those rows are now flagged is_seed = true
-- and excluded from volume ranking and all invariant sums. Charts may keep
-- them (per §4 I6, chart inclusion is optional) so markets retain visual
-- history. Every engine-settled trade carries both order ids, so the existing
-- seed rows are exactly those with neither.

alter table public.trades
  add column is_seed boolean not null default false;

update public.trades
  set is_seed = true
  where taker_order_id is null and maker_order_id is null;

-- live-volume queries filter on is_seed; keep them off the seed rows' path
create index trades_market_live_idx
  on public.trades (market_id, created_at desc)
  where not is_seed;

-- bot_backfill v2: identical walk generator, but output is flagged as seed
create or replace function public.bot_backfill(p_market_id uuid, p_days int, p_trades int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target numeric;
  v_p numeric;
  v_t timestamptz;
  v_kinds text[] := array['transfer_yes', 'transfer_no', 'mint', 'merge'];
  i int;
begin
  select coalesce(
    (select target from public.bot_market_state where market_id = p_market_id),
    0.30 + random() * 0.40
  ) into v_target;

  v_p := greatest(0.05, least(0.95, v_target + (random() - 0.5) * 0.2));
  for i in 1..p_trades loop
    v_t := now() - (p_days * interval '1 day') + (i::numeric / p_trades) * (p_days * interval '1 day')
           - (random() * interval '3 hours');
    v_p := greatest(0.03, least(0.97, v_p + (random() - 0.5) * 0.05 + (v_target - v_p) * 0.03));
    insert into public.trades (market_id, outcome, price, size, kind, created_at, is_seed)
    values (
      p_market_id, 'YES', round(v_p::numeric, 2),
      round((10 + random() * 500)::numeric, 2),
      v_kinds[1 + floor(random() * 4)::int],
      v_t,
      true
    );
  end loop;

  insert into public.bot_market_state (market_id, target)
    values (p_market_id, round(v_p::numeric, 4))
    on conflict (market_id) do update set target = excluded.target, updated_at = now();
end;
$$;

revoke execute on function public.bot_backfill(uuid, int, int) from public, anon, authenticated;
