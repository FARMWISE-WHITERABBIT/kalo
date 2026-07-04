-- Engine v3 (M1: P0-1, P0-2, P0-4, and the place_order/cancel_order half of
-- P0-6). What changed and why:
--
-- P0-1  Unified-book best execution. v2 tried transfer, then mint, then merge
--       — settlement kind had priority over price, so a taker could fill at a
--       worse effective price than the book offered on another path. v3
--       selects, per iteration, the single best effective counterparty across
--       BOTH paths (direct same-outcome and complement) from one candidate
--       query, ordering by effective price then created_at, so the time
--       tie-break spans both candidate sets. Maker still fills at the maker's
--       own limit; the taker keeps any improvement. Settlement kind is derived
--       from the maker picked, not the other way round.
--
-- P0-2  Tick and minimum size. Prices must sit exactly on the 0.01 grid in
--       [0.01, 0.99] and sizes must be >= markets.min_order_size with at most
--       2 decimal places. Violations are rejected, never rounded. The limits
--       are published as per-market columns (tick_size, min_order_size) so
--       clients read them instead of hardcoding. Applies to new orders only.
--
-- P0-3  (partial) place_order rejects orders once now() >= close_at even
--       while status is still 'open'. The open->closed cron transition ships
--       in migration 0007.
--
-- P0-4  Self-trade prevention. The candidate query skips makers with the
--       taker's own user_id (skip-and-continue). Wash prints can no longer
--       reach trades, which also de-fangs volume-ranking manipulation.
--
-- P0-6  (partial) pg_advisory_xact_lock(hashtext(market_id)) serializes all
--       mutations per market in place_order and cancel_order. for update
--       skip locked remains inside as a second layer. resolve_market and the
--       close job take the same lock in 0007.
--
-- Exactness note: prices are 2dp and sizes 2dp, so every cash movement is an
-- exact 4dp numeric — no rounding happens anywhere in the engine.

-- ── P0-2: per-market trading config, published to clients ───────────────

alter table public.markets
  add column tick_size numeric(4, 2) not null default 0.01,
  add column min_order_size numeric(14, 2) not null default 1.00;

-- ── place_order v3 ──────────────────────────────────────────────────────

create or replace function public.place_order(
  p_market_id uuid,
  p_outcome text,
  p_side text,
  p_price numeric,
  p_size numeric,
  p_ioc boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_market record;
  v_order_id uuid;
  v_balance numeric;
  v_shares numeric;
  v_remaining numeric := p_size;
  v_other text;
  v_match record;
  v_qty numeric;
  v_eff numeric;  -- effective fill price in the taker's outcome terms
  v_kind text;
  v_loops int := 0;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_outcome not in ('YES', 'NO') then
    raise exception 'invalid outcome';
  end if;
  if p_side not in ('BUY', 'SELL') then
    raise exception 'invalid side';
  end if;

  -- P0-6: serialize every mutation of this market
  perform pg_advisory_xact_lock(hashtext(p_market_id::text));

  select * into v_market from public.markets where id = p_market_id;
  if not found or v_market.status <> 'open' then
    raise exception 'market is not open';
  end if;
  -- P0-3: close_at is binding even before the cron flips status
  if v_market.close_at is not null and now() >= v_market.close_at then
    raise exception 'market is closed to new orders';
  end if;

  -- P0-2: reject off-grid prices and undersized orders — never round
  if p_price is null or p_price < 0.01 or p_price > 0.99
     or p_price <> round(p_price, 2) then
    raise exception 'price must be on the % grid between 0.01 and 0.99', v_market.tick_size;
  end if;
  if p_size is null or p_size < v_market.min_order_size
     or p_size <> round(p_size, 2) then
    raise exception 'size must be at least % with at most 2 decimal places', v_market.min_order_size;
  end if;

  v_other := case when p_outcome = 'YES' then 'NO' else 'YES' end;

  -- escrow the incoming order (unchanged from v2)
  if p_side = 'BUY' then
    select balance into v_balance from public.profiles where id = v_user for update;
    if v_balance < p_price * p_size then
      raise exception 'insufficient balance';
    end if;
    update public.profiles set balance = balance - (p_price * p_size) where id = v_user;
  else
    select shares into v_shares from public.positions
      where user_id = v_user and market_id = p_market_id and outcome = p_outcome for update;
    if coalesce(v_shares, 0) < p_size then
      raise exception 'insufficient shares';
    end if;
    update public.positions set shares = shares - p_size
      where user_id = v_user and market_id = p_market_id and outcome = p_outcome;
  end if;

  insert into public.orders (user_id, market_id, outcome, side, price, size, filled_size, status)
    values (v_user, p_market_id, p_outcome, p_side, p_price, p_size, 0, 'open')
    returning id into v_order_id;

  -- P0-1: unified matching loop — one candidate query spanning both paths
  while v_remaining > 0 and v_loops < 1000 loop
    v_loops := v_loops + 1;
    v_match := null;

    if p_side = 'BUY' then
      -- candidates: (a) SELL same outcome, price <= limit  -> cost = price
      --             (b) BUY complement, price + limit >= 1 -> cost = 1 - price
      select o.*,
             case when o.outcome = p_outcome then o.price else 1 - o.price end as eff
        into v_match
        from public.orders o
       where o.market_id = p_market_id
         and o.status in ('open', 'partial')
         and o.id <> v_order_id
         and o.user_id <> v_user  -- P0-4: never match own orders
         and (
           (o.outcome = p_outcome and o.side = 'SELL' and o.price <= p_price)
           or
           (o.outcome = v_other and o.side = 'BUY' and o.price + p_price >= 1)
         )
       order by case when o.outcome = p_outcome then o.price else 1 - o.price end asc,
                o.created_at asc
       limit 1
       for update of o skip locked;
    else
      -- candidates: (a) BUY same outcome, price >= limit   -> proceeds = price
      --             (b) SELL complement, price + limit <= 1 -> proceeds = 1 - price
      select o.*,
             case when o.outcome = p_outcome then o.price else 1 - o.price end as eff
        into v_match
        from public.orders o
       where o.market_id = p_market_id
         and o.status in ('open', 'partial')
         and o.id <> v_order_id
         and o.user_id <> v_user  -- P0-4
         and (
           (o.outcome = p_outcome and o.side = 'BUY' and o.price >= p_price)
           or
           (o.outcome = v_other and o.side = 'SELL' and o.price + p_price <= 1)
         )
       order by case when o.outcome = p_outcome then o.price else 1 - o.price end desc,
                o.created_at asc
       limit 1
       for update of o skip locked;
    end if;

    exit when not found;

    v_qty := least(v_remaining, v_match.size - v_match.filled_size);
    v_eff := v_match.eff;

    -- settle by the kind implied by the maker we picked
    if p_side = 'BUY' and v_match.outcome = p_outcome then
      -- transfer: maker sold shares, taker buys them
      v_kind := case when p_outcome = 'YES' then 'transfer_yes' else 'transfer_no' end;
      insert into public.positions (user_id, market_id, outcome, shares)
        values (v_user, p_market_id, p_outcome, v_qty)
        on conflict (user_id, market_id, outcome) do update set shares = public.positions.shares + excluded.shares;
      update public.profiles set balance = balance + (p_price - v_eff) * v_qty where id = v_user;
      update public.profiles set balance = balance + v_eff * v_qty where id = v_match.user_id;

    elsif p_side = 'BUY' then
      -- mint: taker BUY O + maker BUY complement fund a new pair
      v_kind := 'mint';
      insert into public.positions (user_id, market_id, outcome, shares)
        values (v_user, p_market_id, p_outcome, v_qty)
        on conflict (user_id, market_id, outcome) do update set shares = public.positions.shares + excluded.shares;
      insert into public.positions (user_id, market_id, outcome, shares)
        values (v_match.user_id, p_market_id, v_other, v_qty)
        on conflict (user_id, market_id, outcome) do update set shares = public.positions.shares + excluded.shares;
      update public.profiles set balance = balance + (p_price - v_eff) * v_qty where id = v_user;

    elsif v_match.outcome = p_outcome then
      -- transfer: taker sells shares to a same-outcome buyer at maker's limit
      v_kind := case when p_outcome = 'YES' then 'transfer_yes' else 'transfer_no' end;
      update public.profiles set balance = balance + v_eff * v_qty where id = v_user;
      insert into public.positions (user_id, market_id, outcome, shares)
        values (v_match.user_id, p_market_id, p_outcome, v_qty)
        on conflict (user_id, market_id, outcome) do update set shares = public.positions.shares + excluded.shares;

    else
      -- merge: taker SELL O + maker SELL complement burn a pair for $1
      v_kind := 'merge';
      update public.profiles set balance = balance + v_eff * v_qty where id = v_user;
      update public.profiles set balance = balance + v_match.price * v_qty where id = v_match.user_id;
    end if;

    update public.orders set filled_size = filled_size + v_qty,
      status = case when filled_size + v_qty >= size then 'filled' else 'partial' end
      where id = v_match.id;
    update public.orders set filled_size = filled_size + v_qty,
      status = case when filled_size + v_qty >= size then 'filled' else 'partial' end
      where id = v_order_id;

    insert into public.trades (market_id, outcome, price, size, taker_order_id, maker_order_id, kind)
      values (p_market_id, p_outcome, v_eff, v_qty, v_order_id, v_match.id, v_kind);

    v_remaining := v_remaining - v_qty;
  end loop;

  -- IOC: cancel any unfilled remainder and refund its escrow (unchanged)
  if p_ioc and v_remaining > 0 then
    if p_side = 'BUY' then
      update public.profiles set balance = balance + (p_price * v_remaining) where id = v_user;
    else
      update public.positions set shares = shares + v_remaining
        where user_id = v_user and market_id = p_market_id and outcome = p_outcome;
    end if;
    update public.orders set status = 'cancelled' where id = v_order_id;
  end if;

  return v_order_id;
end;
$$;

-- ── cancel_order v2: same advisory lock (P0-6) ─────────────────────────

create or replace function public.cancel_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market_id uuid;
  v_order record;
  v_remaining numeric;
begin
  select market_id into v_market_id from public.orders where id = p_order_id and user_id = auth.uid();
  if not found then
    raise exception 'order not found';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_market_id::text));

  select * into v_order from public.orders where id = p_order_id and user_id = auth.uid() for update;
  if v_order.status not in ('open', 'partial') then
    raise exception 'order not cancellable';
  end if;

  v_remaining := v_order.size - v_order.filled_size;

  if v_order.side = 'BUY' then
    update public.profiles set balance = balance + (v_order.price * v_remaining) where id = v_order.user_id;
  else
    update public.positions set shares = shares + v_remaining
      where user_id = v_order.user_id and market_id = v_order.market_id and outcome = v_order.outcome;
  end if;

  update public.orders set status = 'cancelled' where id = p_order_id;
end;
$$;

grant execute on function public.place_order(uuid, text, text, numeric, numeric, boolean) to authenticated;
grant execute on function public.cancel_order(uuid) to authenticated;
