-- Kalo matching engine v2: adds the merge settlement path (two SELL orders on
-- opposite outcomes crossing, burning a pair for collateral) and IOC support
-- for marketable orders — completing parity with the reference model's four
-- settlement kinds (transfer YES, transfer NO, mint, merge) plus GTC/FAK-style
-- order behavior. Also tags each trade with its settlement kind for the tape.

alter table public.trades
  add column kind text check (kind in ('transfer_yes', 'transfer_no', 'mint', 'merge'));

drop function if exists public.place_order(uuid, text, text, numeric, numeric);

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
  v_order_id uuid;
  v_balance numeric;
  v_shares numeric;
  v_remaining numeric := p_size;
  v_other_outcome text;
  v_match record;
  v_qty numeric;
  v_fill_price numeric;
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
  if p_price <= 0 or p_price >= 1 then
    raise exception 'price must be between 0 and 1 exclusive';
  end if;
  if p_size <= 0 then
    raise exception 'size must be positive';
  end if;
  if not exists (select 1 from public.markets where id = p_market_id and status = 'open') then
    raise exception 'market is not open';
  end if;

  v_other_outcome := case when p_outcome = 'YES' then 'NO' else 'YES' end;

  -- escrow the incoming order
  if p_side = 'BUY' then
    select balance into v_balance from public.profiles where id = v_user for update;
    if v_balance < p_price * p_size then
      raise exception 'insufficient balance';
    end if;
    update public.profiles set balance = balance - (p_price * p_size) where id = v_user;
  else
    select shares into v_shares from public.positions where user_id = v_user and market_id = p_market_id and outcome = p_outcome for update;
    if coalesce(v_shares, 0) < p_size then
      raise exception 'insufficient shares';
    end if;
    update public.positions set shares = shares - p_size where user_id = v_user and market_id = p_market_id and outcome = p_outcome;
  end if;

  insert into public.orders (user_id, market_id, outcome, side, price, size, filled_size, status)
    values (v_user, p_market_id, p_outcome, p_side, p_price, p_size, 0, 'open')
    returning id into v_order_id;

  while v_remaining > 0 and v_loops < 1000 loop
    v_loops := v_loops + 1;
    v_match := null;

    -- 1) direct opposite-side, same-outcome match (transfer)
    if p_side = 'BUY' then
      select * into v_match from public.orders
        where market_id = p_market_id and outcome = p_outcome and side = 'SELL'
          and status in ('open', 'partial') and id <> v_order_id and price <= p_price
        order by price asc, created_at asc
        limit 1 for update skip locked;
    else
      select * into v_match from public.orders
        where market_id = p_market_id and outcome = p_outcome and side = 'BUY'
          and status in ('open', 'partial') and id <> v_order_id and price >= p_price
        order by price desc, created_at asc
        limit 1 for update skip locked;
    end if;

    if found then
      v_qty := least(v_remaining, v_match.size - v_match.filled_size);
      v_fill_price := v_match.price;

      if p_side = 'BUY' then
        insert into public.positions (user_id, market_id, outcome, shares)
          values (v_user, p_market_id, p_outcome, v_qty)
          on conflict (user_id, market_id, outcome) do update set shares = public.positions.shares + excluded.shares;
        update public.profiles set balance = balance + (p_price - v_fill_price) * v_qty where id = v_user;
        update public.profiles set balance = balance + v_fill_price * v_qty where id = v_match.user_id;
      else
        update public.profiles set balance = balance + v_fill_price * v_qty where id = v_user;
        insert into public.positions (user_id, market_id, outcome, shares)
          values (v_match.user_id, p_market_id, p_outcome, v_qty)
          on conflict (user_id, market_id, outcome) do update set shares = public.positions.shares + excluded.shares;
      end if;

      update public.orders set filled_size = filled_size + v_qty,
        status = case when filled_size + v_qty >= size then 'filled' else 'partial' end
        where id = v_match.id;
      update public.orders set filled_size = filled_size + v_qty,
        status = case when filled_size + v_qty >= size then 'filled' else 'partial' end
        where id = v_order_id;

      insert into public.trades (market_id, outcome, price, size, taker_order_id, maker_order_id, kind)
        values (p_market_id, p_outcome, v_fill_price, v_qty, v_order_id, v_match.id,
          case when p_outcome = 'YES' then 'transfer_yes' else 'transfer_no' end);

      v_remaining := v_remaining - v_qty;
      continue;
    end if;

    -- 2) mint match: both BUY, cross-outcome, prices summing >= $1
    if p_side = 'BUY' then
      select * into v_match from public.orders
        where market_id = p_market_id and outcome = v_other_outcome and side = 'BUY'
          and status in ('open', 'partial') and (price + p_price) >= 1
        order by price desc, created_at asc
        limit 1 for update skip locked;

      if found then
        v_qty := least(v_remaining, v_match.size - v_match.filled_size);
        v_fill_price := 1 - v_match.price;

        insert into public.positions (user_id, market_id, outcome, shares)
          values (v_user, p_market_id, p_outcome, v_qty)
          on conflict (user_id, market_id, outcome) do update set shares = public.positions.shares + excluded.shares;
        insert into public.positions (user_id, market_id, outcome, shares)
          values (v_match.user_id, p_market_id, v_other_outcome, v_qty)
          on conflict (user_id, market_id, outcome) do update set shares = public.positions.shares + excluded.shares;

        -- refund taker's price improvement; maker already escrowed exactly v_match.price * qty
        update public.profiles set balance = balance + (p_price - v_fill_price) * v_qty where id = v_user;

        update public.orders set filled_size = filled_size + v_qty,
          status = case when filled_size + v_qty >= size then 'filled' else 'partial' end
          where id = v_match.id;
        update public.orders set filled_size = filled_size + v_qty,
          status = case when filled_size + v_qty >= size then 'filled' else 'partial' end
          where id = v_order_id;

        insert into public.trades (market_id, outcome, price, size, taker_order_id, maker_order_id, kind)
          values (p_market_id, p_outcome, v_fill_price, v_qty, v_order_id, v_match.id, 'mint');

        v_remaining := v_remaining - v_qty;
        continue;
      end if;
    end if;

    -- 3) merge match: both SELL, cross-outcome, prices summing <= $1 — burns a
    -- pair and releases collateral as cash to both sellers; no shares move
    -- since both sides already escrowed (deducted) their shares at placement.
    if p_side = 'SELL' then
      select * into v_match from public.orders
        where market_id = p_market_id and outcome = v_other_outcome and side = 'SELL'
          and status in ('open', 'partial') and (price + p_price) <= 1
        order by price asc, created_at asc
        limit 1 for update skip locked;

      if found then
        v_qty := least(v_remaining, v_match.size - v_match.filled_size);
        v_fill_price := 1 - v_match.price;

        update public.profiles set balance = balance + v_fill_price * v_qty where id = v_user;
        update public.profiles set balance = balance + v_match.price * v_qty where id = v_match.user_id;

        update public.orders set filled_size = filled_size + v_qty,
          status = case when filled_size + v_qty >= size then 'filled' else 'partial' end
          where id = v_match.id;
        update public.orders set filled_size = filled_size + v_qty,
          status = case when filled_size + v_qty >= size then 'filled' else 'partial' end
          where id = v_order_id;

        insert into public.trades (market_id, outcome, price, size, taker_order_id, maker_order_id, kind)
          values (p_market_id, p_outcome, v_fill_price, v_qty, v_order_id, v_match.id, 'merge');

        v_remaining := v_remaining - v_qty;
        continue;
      end if;
    end if;

    exit;
  end loop;

  -- IOC: cancel any unfilled remainder and refund its escrow instead of resting
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

grant execute on function public.place_order(uuid, text, text, numeric, numeric, boolean) to authenticated;
