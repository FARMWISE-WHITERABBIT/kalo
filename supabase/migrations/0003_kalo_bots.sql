-- Kalo activity bots: a small fleet of in-database market-maker/taker
-- accounts that trade against each other through the real matching engine
-- (place_order / cancel_order), so the platform shows live order books,
-- prints, and price movement without human traders.
--
-- Design:
--   * bot_traders        — which profiles are bots
--   * bot_market_state   — a hidden per-market "true probability" that
--                          random-walks; bots quote around it
--   * bot_provision(n)   — creates bot auth users + profiles
--   * bot_tick()         — one round of quoting/crossing; scheduled with
--                          pg_cron every minute
--   * bot_backfill(...)  — cosmetic historical prints so charts have
--                          history from day one (direct trades inserts,
--                          not collateralized — seed data only)

create table public.bot_traders (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  persona text not null default 'mixed',
  created_at timestamptz not null default now()
);

create table public.bot_market_state (
  market_id uuid primary key references public.markets (id) on delete cascade,
  target numeric(5, 4) not null,
  updated_at timestamptz not null default now()
);

alter table public.bot_traders enable row level security;
alter table public.bot_market_state enable row level security;
-- no policies: bot bookkeeping is not client-readable

-- ── helpers ────────────────────────────────────────────────────────────

-- Runs subsequent SECURITY DEFINER RPCs (place_order, cancel_order) as the
-- given bot by injecting the JWT claim auth.uid() reads. Transaction-local.
create or replace function public.bot_impersonate(p_user uuid)
returns void
language sql
security definer
set search_path = public
as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text,
    true
  );
$$;

-- ── provisioning ───────────────────────────────────────────────────────

create or replace function public.bot_provision()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_names text[] := array['aurora','brontes','cassio','delphi','echofund','fenwick','gausscap','harrier'];
  v_name text;
  v_id uuid;
  v_created int := 0;
begin
  foreach v_name in array v_names loop
    if exists (select 1 from auth.users where email = 'bot-' || v_name || '@bots.kalo.local') then
      continue;
    end if;

    v_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      'bot-' || v_name || '@bots.kalo.local',
      '!disabled-login!',  -- never a valid bcrypt hash: bots cannot log in
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('display_name', v_name),
      now(), now(), '', '', '', ''
    );
    -- handle_new_user trigger created the profile; register + fund it
    insert into public.bot_traders (user_id) values (v_id);
    update public.profiles set balance = 250000 where id = v_id;
    v_created := v_created + 1;
  end loop;
  return v_created;
end;
$$;

-- ── the tick ───────────────────────────────────────────────────────────

create or replace function public.bot_tick()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market record;
  v_order record;
  v_target numeric;
  v_bid numeric;
  v_ask numeric;
  v_maker1 uuid;
  v_maker2 uuid;
  v_taker uuid;
  v_shares numeric;
  v_size numeric;
begin
  if not exists (select 1 from public.bot_traders) then
    return;
  end if;

  -- play-money faucet: keep bots solvent so the simulation never stalls
  update public.profiles set balance = 250000
    where id in (select user_id from public.bot_traders) and balance < 50000;

  for v_market in
    select m.id from public.markets m where m.status = 'open' order by random() limit 4
  loop
    -- seed state from the last print (or a random prior)
    insert into public.bot_market_state (market_id, target)
    values (
      v_market.id,
      coalesce(
        (select case when t.outcome = 'YES' then t.price else 1 - t.price end
           from public.trades t where t.market_id = v_market.id
           order by t.created_at desc limit 1),
        0.30 + random() * 0.40
      )
    )
    on conflict (market_id) do nothing;

    -- drift the hidden "true" probability
    update public.bot_market_state
      set target = greatest(0.03, least(0.97, target + (random() - 0.5) * 0.04)),
          updated_at = now()
      where market_id = v_market.id
      returning target into v_target;

    -- retire stale bot quotes so the book stays fresh
    for v_order in
      select o.id, o.user_id from public.orders o
      join public.bot_traders b on b.user_id = o.user_id
      where o.market_id = v_market.id and o.status in ('open', 'partial')
        and o.created_at < now() - interval '25 minutes'
    loop
      perform public.bot_impersonate(v_order.user_id);
      perform public.cancel_order(v_order.id);
    end loop;

    -- two makers requote: a YES bid and a NO bid — in the unified YES-terms
    -- book the NO bid reads as the ask, so this quotes both sides
    v_bid := round(greatest(0.02, least(0.96, v_target - (0.01 + random() * 0.03)))::numeric, 2);
    v_ask := round(greatest(v_bid + 0.02, least(0.98, v_target + (0.01 + random() * 0.03)))::numeric, 2);

    select user_id into v_maker1 from public.bot_traders order by random() limit 1;
    select user_id into v_maker2 from public.bot_traders where user_id <> v_maker1 order by random() limit 1;

    perform public.bot_impersonate(v_maker1);
    perform public.place_order(v_market.id, 'YES', 'BUY', v_bid, round((50 + random() * 400)::numeric, 2));
    perform public.bot_impersonate(v_maker2);
    perform public.place_order(v_market.id, 'NO', 'BUY', round(1 - v_ask, 2), round((50 + random() * 400)::numeric, 2));

    -- ~60% of ticks a taker crosses the spread, printing a trade and pulling
    -- the last price toward the target
    if random() < 0.6 then
      select user_id into v_taker from public.bot_traders
        where user_id not in (v_maker1, v_maker2) order by random() limit 1;
      perform public.bot_impersonate(v_taker);
      v_size := round((20 + random() * 250)::numeric, 2);

      if random() < 0.5 then
        perform public.place_order(
          v_market.id, 'YES', 'BUY',
          least(0.98, v_ask + 0.02), v_size, true);
      else
        select coalesce(shares, 0) into v_shares from public.positions
          where user_id = v_taker and market_id = v_market.id and outcome = 'YES';
        if coalesce(v_shares, 0) > 20 then
          perform public.place_order(
            v_market.id, 'YES', 'SELL',
            greatest(0.02, v_bid - 0.02), least(v_shares, v_size), true);
        else
          perform public.place_order(
            v_market.id, 'NO', 'BUY',
            least(0.98, round(1 - v_bid, 2) + 0.02), v_size, true);
        end if;
      end if;
    end if;
  end loop;

  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- ── backfill (cosmetic seed history for charts) ────────────────────────

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

  -- walk backwards-compatible: start near target, wander, end near target
  v_p := greatest(0.05, least(0.95, v_target + (random() - 0.5) * 0.2));
  for i in 1..p_trades loop
    v_t := now() - (p_days * interval '1 day') + (i::numeric / p_trades) * (p_days * interval '1 day')
           - (random() * interval '3 hours');
    v_p := greatest(0.03, least(0.97, v_p + (random() - 0.5) * 0.05 + (v_target - v_p) * 0.03));
    insert into public.trades (market_id, outcome, price, size, kind, created_at)
    values (
      p_market_id, 'YES', round(v_p::numeric, 2),
      round((10 + random() * 500)::numeric, 2),
      v_kinds[1 + floor(random() * 4)::int],
      v_t
    );
  end loop;

  insert into public.bot_market_state (market_id, target)
    values (p_market_id, round(v_p::numeric, 4))
    on conflict (market_id) do update set target = excluded.target, updated_at = now();
end;
$$;

-- Bot machinery is operator-only: no client role may call it.
revoke execute on function public.bot_impersonate(uuid) from public, anon, authenticated;
revoke execute on function public.bot_provision() from public, anon, authenticated;
revoke execute on function public.bot_tick() from public, anon, authenticated;
revoke execute on function public.bot_backfill(uuid, int, int) from public, anon, authenticated;

-- ── schedule: one tick per minute ──────────────────────────────────────

create extension if not exists pg_cron;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'kalo-bot-tick') then
    perform cron.schedule('kalo-bot-tick', '* * * * *', 'select public.bot_tick()');
  end if;
end;
$$;
