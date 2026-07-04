-- M2: P0-7 (idempotent order submission), P0-8 (fee hooks at zero), and the
-- GTD/FOK order types (§6.3). One migration because all four changes live in
-- the place_order body; supporting DDL is here too. What changed and why:
--
-- P0-7  orders.client_order_id + a per-user unique partial index. place_order
--       gains p_client_order_id; when a (user, client_order_id) pair already
--       exists the call returns the existing order id instead of double-
--       placing. The check runs under the market advisory lock, so identical
--       concurrent retries serialize; the unique index is the backstop.
--
-- P0-8  markets.fee_bps (default 0, capped) and trades.fee_amount. Fees are
--       charged to the taker on the OUTPUT asset, mirroring Polymarket's CTF
--       fee model: buys pay in shares, sells pay in cash, computed as
--       bps/10000 x min(eff, 1-eff) x qty. Proceeds/credits go to a system
--       treasury profile (a normal profile, so I1 needs no new term — the
--       treasury balance is inside sum(balances); invariant_report surfaces
--       it separately for visibility). Rate stays 0 in Phase 1: the
--       accounting paths exist and are exercised at zero.
--
-- §6.3  GTD: orders.expires_at, validated against now() and close_at; expired
--       orders are excluded from matching immediately and refunded by the
--       expiry cron (migration 0011). FOK: under the advisory lock the
--       fillable quantity across the unified book is pre-computed; if it
--       cannot fill completely the order is rejected before any escrow moves.
--       Surface: GTC (default), FAK (p_ioc), FOK (p_fok), GTD (p_expires_at).
--
-- The signature changes (new defaulted params), so the old 6-arg function is
-- dropped first. All existing callers pass positional prefixes and keep
-- working.

alter table public.orders
  add column client_order_id uuid,
  add column expires_at timestamptz;

create unique index orders_client_order_idx
  on public.orders (user_id, client_order_id)
  where client_order_id is not null;

alter table public.markets
  add column fee_bps int not null default 0 check (fee_bps >= 0 and fee_bps <= 500);

alter table public.trades
  add column fee_amount numeric(14, 4) not null default 0;

-- system treasury account (fees accrue here when fee_bps > 0)
do $$
declare
  v_id uuid := gen_random_uuid();
begin
  if not exists (select 1 from auth.users where email = 'treasury@system.kalo.local') then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      'treasury@system.kalo.local', '!disabled-login!',
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Kalo Treasury"}'::jsonb,
      now(), now(), '', '', '', ''
    );
  end if;
end;
$$;

create or replace function public.treasury_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select u.id from auth.users u where u.email = 'treasury@system.kalo.local';
$$;
revoke execute on function public.treasury_id() from public, anon, authenticated;

drop function if exists public.place_order(uuid, text, text, numeric, numeric, boolean);

create or replace function public.place_order(
  p_market_id uuid,
  p_outcome text,
  p_side text,
  p_price numeric,
  p_size numeric,
  p_ioc boolean default false,
  p_fok boolean default false,
  p_expires_at timestamptz default null,
  p_client_order_id uuid default null
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
  v_eff numeric;
  v_fee numeric;
  v_kind text;
  v_fillable numeric;
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
  if p_ioc and p_fok then
    raise exception 'IOC and FOK are mutually exclusive';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_market_id::text));

  -- P0-7: an identical retry returns the original order, placing nothing
  if p_client_order_id is not null then
    select id into v_order_id from public.orders
      where user_id = v_user and client_order_id = p_client_order_id;
    if found then
      return v_order_id;
    end if;
  end if;

  select * into v_market from public.markets where id = p_market_id;
  if not found or v_market.status <> 'open' then
    raise exception 'market is not open';
  end if;
  if v_market.close_at is not null and now() >= v_market.close_at then
    raise exception 'market is closed to new orders';
  end if;

  if p_price is null or p_price < 0.01 or p_price > 0.99
     or p_price <> round(p_price, 2) then
    raise exception 'price must be on the % grid between 0.01 and 0.99', v_market.tick_size;
  end if;
  if p_size is null or p_size < v_market.min_order_size
     or p_size <> round(p_size, 2) then
    raise exception 'size must be at least % with at most 2 decimal places', v_market.min_order_size;
  end if;

  -- GTD validation
  if p_expires_at is not null then
    if p_expires_at <= now() then
      raise exception 'expiry must be in the future';
    end if;
    if v_market.close_at is not null and p_expires_at > v_market.close_at then
      raise exception 'expiry must not exceed market close';
    end if;
  end if;

  v_other := case when p_outcome = 'YES' then 'NO' else 'YES' end;

  -- FOK: pre-compute the fillable quantity across the unified book under the
  -- advisory lock; reject before any escrow moves if it cannot fill fully
  if p_fok then
    if p_side = 'BUY' then
      select coalesce(sum(o.size - o.filled_size), 0) into v_fillable
        from public.orders o
       where o.market_id = p_market_id and o.status in ('open', 'partial')
         and o.user_id <> v_user
         and (o.expires_at is null or o.expires_at > now())
         and (
           (o.outcome = p_outcome and o.side = 'SELL' and o.price <= p_price)
           or
           (o.outcome = v_other and o.side = 'BUY' and o.price + p_price >= 1)
         );
    else
      select coalesce(sum(o.size - o.filled_size), 0) into v_fillable
        from public.orders o
       where o.market_id = p_market_id and o.status in ('open', 'partial')
         and o.user_id <> v_user
         and (o.expires_at is null or o.expires_at > now())
         and (
           (o.outcome = p_outcome and o.side = 'BUY' and o.price >= p_price)
           or
           (o.outcome = v_other and o.side = 'SELL' and o.price + p_price <= 1)
         );
    end if;
    if v_fillable < p_size then
      raise exception 'FOK: only % of % fillable at the limit', v_fillable, p_size;
    end if;
  end if;

  -- escrow
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

  insert into public.orders (user_id, market_id, outcome, side, price, size, filled_size, status, client_order_id, expires_at)
    values (v_user, p_market_id, p_outcome, p_side, p_price, p_size, 0, 'open', p_client_order_id, p_expires_at)
    returning id into v_order_id;

  while v_remaining > 0 and v_loops < 1000 loop
    v_loops := v_loops + 1;
    v_match := null;

    if p_side = 'BUY' then
      select o.*,
             case when o.outcome = p_outcome then o.price else 1 - o.price end as eff
        into v_match
        from public.orders o
       where o.market_id = p_market_id
         and o.status in ('open', 'partial')
         and o.id <> v_order_id
         and o.user_id <> v_user
         and (o.expires_at is null or o.expires_at > now())
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
      select o.*,
             case when o.outcome = p_outcome then o.price else 1 - o.price end as eff
        into v_match
        from public.orders o
       where o.market_id = p_market_id
         and o.status in ('open', 'partial')
         and o.id <> v_order_id
         and o.user_id <> v_user
         and (o.expires_at is null or o.expires_at > now())
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
    -- P0-8: taker fee on the output asset (shares for buys, cash for sells)
    v_fee := round((v_market.fee_bps / 10000.0) * least(v_eff, 1 - v_eff) * v_qty, 4);

    if p_side = 'BUY' and v_match.outcome = p_outcome then
      v_kind := case when p_outcome = 'YES' then 'transfer_yes' else 'transfer_no' end;
      insert into public.positions (user_id, market_id, outcome, shares)
        values (v_user, p_market_id, p_outcome, v_qty - v_fee)
        on conflict (user_id, market_id, outcome) do update set shares = public.positions.shares + excluded.shares;
      update public.profiles set balance = balance + (p_price - v_eff) * v_qty where id = v_user;
      update public.profiles set balance = balance + v_eff * v_qty where id = v_match.user_id;
      if v_fee > 0 then
        insert into public.positions (user_id, market_id, outcome, shares)
          values (public.treasury_id(), p_market_id, p_outcome, v_fee)
          on conflict (user_id, market_id, outcome) do update set shares = public.positions.shares + excluded.shares;
      end if;

    elsif p_side = 'BUY' then
      v_kind := 'mint';
      insert into public.positions (user_id, market_id, outcome, shares)
        values (v_user, p_market_id, p_outcome, v_qty - v_fee)
        on conflict (user_id, market_id, outcome) do update set shares = public.positions.shares + excluded.shares;
      insert into public.positions (user_id, market_id, outcome, shares)
        values (v_match.user_id, p_market_id, v_other, v_qty)
        on conflict (user_id, market_id, outcome) do update set shares = public.positions.shares + excluded.shares;
      update public.profiles set balance = balance + (p_price - v_eff) * v_qty where id = v_user;
      if v_fee > 0 then
        insert into public.positions (user_id, market_id, outcome, shares)
          values (public.treasury_id(), p_market_id, p_outcome, v_fee)
          on conflict (user_id, market_id, outcome) do update set shares = public.positions.shares + excluded.shares;
      end if;

    elsif v_match.outcome = p_outcome then
      v_kind := case when p_outcome = 'YES' then 'transfer_yes' else 'transfer_no' end;
      update public.profiles set balance = balance + (v_eff * v_qty - v_fee) where id = v_user;
      insert into public.positions (user_id, market_id, outcome, shares)
        values (v_match.user_id, p_market_id, p_outcome, v_qty)
        on conflict (user_id, market_id, outcome) do update set shares = public.positions.shares + excluded.shares;
      if v_fee > 0 then
        update public.profiles set balance = balance + v_fee where id = public.treasury_id();
      end if;

    else
      v_kind := 'merge';
      update public.profiles set balance = balance + (v_eff * v_qty - v_fee) where id = v_user;
      update public.profiles set balance = balance + v_match.price * v_qty where id = v_match.user_id;
      if v_fee > 0 then
        update public.profiles set balance = balance + v_fee where id = public.treasury_id();
      end if;
    end if;

    update public.orders set filled_size = filled_size + v_qty,
      status = case when filled_size + v_qty >= size then 'filled' else 'partial' end
      where id = v_match.id;
    update public.orders set filled_size = filled_size + v_qty,
      status = case when filled_size + v_qty >= size then 'filled' else 'partial' end
      where id = v_order_id;

    insert into public.trades (market_id, outcome, price, size, taker_order_id, maker_order_id, kind, fee_amount)
      values (p_market_id, p_outcome, v_eff, v_qty, v_order_id, v_match.id, v_kind, v_fee);

    v_remaining := v_remaining - v_qty;
  end loop;

  -- FOK is all-or-nothing by construction; defensive assert so a logic bug
  -- rolls the whole order back instead of resting a remainder
  if p_fok and v_remaining > 0 then
    raise exception 'FOK: fill incomplete (% remaining)', v_remaining;
  end if;

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

grant execute on function public.place_order(uuid, text, text, numeric, numeric, boolean, boolean, timestamptz, uuid) to authenticated;
