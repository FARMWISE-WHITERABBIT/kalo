-- Kalo core schema: play-money binary prediction markets on a Polymarket-style
-- foundation (fully-collateralized outcome-pair shares, order book with
-- price-time priority matching, complementary cross-outcome mint matching,
-- admin-resolved oracle).

-- ── Tables ──────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  balance numeric(14, 2) not null default 1000.00 check (balance >= 0),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.markets (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  description text,
  category text,
  close_at timestamptz,
  status text not null default 'open' check (status in ('open', 'closed', 'resolved')),
  resolved_outcome text check (resolved_outcome in ('YES', 'NO')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  market_id uuid not null references public.markets (id) on delete cascade,
  outcome text not null check (outcome in ('YES', 'NO')),
  shares numeric(14, 4) not null default 0 check (shares >= 0),
  unique (user_id, market_id, outcome)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  market_id uuid not null references public.markets (id) on delete cascade,
  outcome text not null check (outcome in ('YES', 'NO')),
  side text not null check (side in ('BUY', 'SELL')),
  price numeric(4, 2) not null check (price > 0 and price < 1),
  size numeric(14, 4) not null check (size > 0),
  filled_size numeric(14, 4) not null default 0 check (filled_size >= 0),
  status text not null default 'open' check (status in ('open', 'partial', 'filled', 'cancelled')),
  created_at timestamptz not null default now()
);

create index orders_book_idx on public.orders (market_id, outcome, side, status, price, created_at);
create index orders_user_idx on public.orders (user_id, created_at desc);

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets (id) on delete cascade,
  outcome text not null check (outcome in ('YES', 'NO')),
  price numeric(4, 2) not null,
  size numeric(14, 4) not null,
  taker_order_id uuid references public.orders (id),
  maker_order_id uuid references public.orders (id),
  created_at timestamptz not null default now()
);

create index trades_market_idx on public.trades (market_id, created_at desc);
create index positions_user_idx on public.positions (user_id);

-- ── New user provisioning (seeds play-money balance) ───────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, balance)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    1000.00
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── RLS: read is open (or own-row for positions/orders), all writes go
--        through SECURITY DEFINER RPCs below ─────────────────────────

alter table public.profiles enable row level security;
alter table public.markets enable row level security;
alter table public.positions enable row level security;
alter table public.orders enable row level security;
alter table public.trades enable row level security;

create policy "profiles are publicly readable" on public.profiles for select using (true);
create policy "markets are publicly readable" on public.markets for select using (true);
create policy "own positions readable" on public.positions for select using (auth.uid() = user_id);
create policy "own orders readable" on public.orders for select using (auth.uid() = user_id);
create policy "trades are publicly readable" on public.trades for select using (true);

revoke insert, update, delete on public.profiles from authenticated, anon;
revoke insert, update, delete on public.markets from authenticated, anon;
revoke insert, update, delete on public.positions from authenticated, anon;
revoke insert, update, delete on public.orders from authenticated, anon;
revoke insert, update, delete on public.trades from authenticated, anon;

-- ── RPCs ─────────────────────────────────────────────────────────────
-- Every balance/share/order mutation is funneled through these
-- SECURITY DEFINER functions so the base tables are never written to
-- directly by a client — mirroring "the operator cannot move funds
-- arbitrarily, only submit valid state transitions" from Polymarket's
-- exchange contract.

-- split(): lock $amount collateral -> mint amount YES + amount NO shares
create or replace function public.split_shares(p_market_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_balance numeric;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  if not exists (select 1 from public.markets where id = p_market_id and status = 'open') then
    raise exception 'market is not open';
  end if;

  select balance into v_balance from public.profiles where id = v_user for update;
  if v_balance < p_amount then
    raise exception 'insufficient balance';
  end if;

  update public.profiles set balance = balance - p_amount where id = v_user;

  insert into public.positions (user_id, market_id, outcome, shares)
    values (v_user, p_market_id, 'YES', p_amount)
    on conflict (user_id, market_id, outcome) do update set shares = public.positions.shares + excluded.shares;
  insert into public.positions (user_id, market_id, outcome, shares)
    values (v_user, p_market_id, 'NO', p_amount)
    on conflict (user_id, market_id, outcome) do update set shares = public.positions.shares + excluded.shares;
end;
$$;

-- merge(): burn equal YES+NO shares -> unlock $shares collateral
create or replace function public.merge_shares(p_market_id uuid, p_shares numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_yes numeric;
  v_no numeric;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_shares <= 0 then
    raise exception 'shares must be positive';
  end if;

  select shares into v_yes from public.positions where user_id = v_user and market_id = p_market_id and outcome = 'YES' for update;
  select shares into v_no from public.positions where user_id = v_user and market_id = p_market_id and outcome = 'NO' for update;

  if coalesce(v_yes, 0) < p_shares or coalesce(v_no, 0) < p_shares then
    raise exception 'insufficient shares to merge';
  end if;

  update public.positions set shares = shares - p_shares where user_id = v_user and market_id = p_market_id and outcome = 'YES';
  update public.positions set shares = shares - p_shares where user_id = v_user and market_id = p_market_id and outcome = 'NO';
  update public.profiles set balance = balance + p_shares where id = v_user;
end;
$$;

-- place_order(): escrows the incoming order, then matches it against the
-- resting book using price-time priority. Two match kinds:
--   1. direct: opposite side, same outcome, crossing price
--   2. complementary: both BUY, opposite outcomes, prices summing >= $1 —
--      settles by minting the pair via split, exactly like Polymarket's
--      CTF Exchange does to bootstrap liquidity without a market maker.
-- The resting (maker) order always fills at its own limit price; the
-- incoming (taker) order is refunded any price improvement versus its
-- own limit. This keeps every fill fully collateralized without a
-- separate escrow ledger.
create or replace function public.place_order(
  p_market_id uuid,
  p_outcome text,
  p_side text,
  p_price numeric,
  p_size numeric
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

    -- 1) direct opposite-side, same-outcome match
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

      insert into public.trades (market_id, outcome, price, size, taker_order_id, maker_order_id)
        values (p_market_id, p_outcome, v_fill_price, v_qty, v_order_id, v_match.id);

      v_remaining := v_remaining - v_qty;
      continue;
    end if;

    -- 2) complementary cross-outcome match (BUY vs BUY, prices summing >= $1)
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

        insert into public.trades (market_id, outcome, price, size, taker_order_id, maker_order_id)
          values (p_market_id, p_outcome, v_fill_price, v_qty, v_order_id, v_match.id);

        v_remaining := v_remaining - v_qty;
        continue;
      end if;
    end if;

    exit;
  end loop;

  return v_order_id;
end;
$$;

-- cancel_order(): refunds unfilled escrow (balance or shares) back to the owner
create or replace function public.cancel_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_remaining numeric;
begin
  select * into v_order from public.orders where id = p_order_id and user_id = auth.uid() for update;
  if not found then
    raise exception 'order not found';
  end if;
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

-- create_market(): admin-only market creation
create or replace function public.create_market(
  p_question text,
  p_description text,
  p_category text,
  p_close_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if not exists (select 1 from public.profiles where id = v_user and is_admin) then
    raise exception 'admin only';
  end if;

  insert into public.markets (question, description, category, close_at, status, created_by)
    values (p_question, p_description, p_category, p_close_at, 'open', v_user)
    returning id into v_id;

  return v_id;
end;
$$;

-- resolve_market(): admin-only. Cancels (and refunds) all resting orders,
-- then closes the market with a final outcome — a deliberately simple
-- stand-in for UMA's optimistic-oracle dispute flow.
create or replace function public.resolve_market(p_market_id uuid, p_outcome text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_order record;
  v_remaining numeric;
begin
  if not exists (select 1 from public.profiles where id = v_user and is_admin) then
    raise exception 'admin only';
  end if;
  if p_outcome not in ('YES', 'NO') then
    raise exception 'invalid outcome';
  end if;
  if not exists (select 1 from public.markets where id = p_market_id and status = 'open') then
    raise exception 'market not open';
  end if;

  for v_order in
    select * from public.orders where market_id = p_market_id and status in ('open', 'partial') for update
  loop
    v_remaining := v_order.size - v_order.filled_size;
    if v_order.side = 'BUY' then
      update public.profiles set balance = balance + (v_order.price * v_remaining) where id = v_order.user_id;
    else
      update public.positions set shares = shares + v_remaining
        where user_id = v_order.user_id and market_id = v_order.market_id and outcome = v_order.outcome;
    end if;
    update public.orders set status = 'cancelled' where id = v_order.id;
  end loop;

  update public.markets set status = 'resolved', resolved_outcome = p_outcome where id = p_market_id;
end;
$$;

-- redeem_market(): burns caller's winning-side shares 1:1 for balance;
-- losing-side shares are zeroed (worthless).
create or replace function public.redeem_market(p_market_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_outcome text;
  v_shares numeric;
begin
  select resolved_outcome into v_outcome from public.markets where id = p_market_id and status = 'resolved';
  if v_outcome is null then
    raise exception 'market not resolved';
  end if;

  select shares into v_shares from public.positions where user_id = v_user and market_id = p_market_id and outcome = v_outcome for update;
  if coalesce(v_shares, 0) <= 0 then
    raise exception 'no winning shares to redeem';
  end if;

  update public.positions set shares = 0 where user_id = v_user and market_id = p_market_id and outcome = v_outcome;
  update public.positions set shares = 0 where user_id = v_user and market_id = p_market_id and outcome = (case when v_outcome = 'YES' then 'NO' else 'YES' end);
  update public.profiles set balance = balance + v_shares where id = v_user;
end;
$$;

-- get_order_book(): aggregated price levels only — never exposes whose orders they are
create or replace function public.get_order_book(p_market_id uuid)
returns table (outcome text, side text, price numeric, size numeric)
language sql
security definer
set search_path = public
stable
as $$
  select outcome, side, price, sum(size - filled_size) as size
  from public.orders
  where market_id = p_market_id and status in ('open', 'partial')
  group by outcome, side, price
  order by price desc;
$$;

grant execute on function public.split_shares(uuid, numeric) to authenticated;
grant execute on function public.merge_shares(uuid, numeric) to authenticated;
grant execute on function public.place_order(uuid, text, text, numeric, numeric) to authenticated;
grant execute on function public.cancel_order(uuid) to authenticated;
grant execute on function public.create_market(text, text, text, timestamptz) to authenticated;
grant execute on function public.resolve_market(uuid, text) to authenticated;
grant execute on function public.redeem_market(uuid) to authenticated;
grant execute on function public.get_order_book(uuid) to authenticated, anon;
