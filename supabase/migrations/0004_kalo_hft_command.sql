-- Kalo bot engine v2: high-frequency simulation concentrated on trending
-- markets, plus command-centre controls.
--
--   * bot_config          — operator-tunable singleton (enabled, aggression,
--                           markets per burst)
--   * bot_market_state v2 — adds momentum (directional drift), heat
--                           (trending multiplier), and news-shock windows
--   * bot_burst(rounds)   — one HFT round: trending-weighted market
--                           selection (Efraimidis–Spirakis sampling), layered
--                           maker quotes, momentum-biased takers
--   * bot_tick()          — cron entrypoint; runs every 15 seconds
--   * bot_status() /      — admin-gated RPCs behind the /admin Command
--     bot_command()         Centre UI
--
-- Trending feedback loop: news shocks kick a market's momentum and heat;
-- heat makes the market more likely to be selected next burst, which prints
-- more volume, which pushes it up the homepage "Hot topics" rail (that rail
-- ranks by 24h volume) — trends emerge and decay like on a real venue.

-- ── config ─────────────────────────────────────────────────────────────

create table public.bot_config (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default true,
  aggression numeric(3, 2) not null default 1.00 check (aggression >= 0.10 and aggression <= 5.00),
  burst_markets int not null default 5 check (burst_markets between 1 and 20),
  updated_at timestamptz not null default now()
);
insert into public.bot_config (id) values (1);
alter table public.bot_config enable row level security;
-- no policies: operator state, reached only through admin-gated RPCs

alter table public.bot_market_state
  add column momentum numeric(6, 4) not null default 0,
  add column heat numeric(6, 3) not null default 1,
  add column shock_until timestamptz;

-- ── the burst ──────────────────────────────────────────────────────────

create or replace function public.bot_burst(p_rounds int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg record;
  v_market record;
  v_state record;
  v_order record;
  v_target numeric;
  v_half numeric;
  v_bid numeric;
  v_ask numeric;
  v_maker uuid;
  v_taker uuid;
  v_level int;
  v_takes int;
  v_size numeric;
  v_shares numeric;
  v_up_bias numeric;
  v_prints int := 0;
begin
  -- note: the enabled switch is enforced by bot_tick(), not here, so a
  -- manual burst from the command centre works while the engine is paused
  select * into v_cfg from public.bot_config where id = 1;
  if v_cfg is null or not exists (select 1 from public.bot_traders) then
    return 0;
  end if;

  -- play-money faucet
  update public.profiles set balance = 250000
    where id in (select user_id from public.bot_traders) and balance < 50000;

  -- ensure every open market has state
  insert into public.bot_market_state (market_id, target)
  select m.id,
         coalesce(
           (select case when t.outcome = 'YES' then t.price else 1 - t.price end
              from public.trades t where t.market_id = m.id
              order by t.created_at desc limit 1),
           0.30 + random() * 0.40)
  from public.markets m
  where m.status = 'open'
  on conflict (market_id) do nothing;

  -- trending-weighted sample: weight = heat × (1 + 24h volume). Sorting by
  -- random()^(1/w) is Efraimidis–Spirakis weighted sampling without
  -- replacement, so hot markets trade far more often but cold ones still
  -- print occasionally.
  for v_market in
    select w.market_id
    from (
      select s.market_id,
             greatest(0.5, s.heat) * (1 + coalesce(v.vol24, 0)) as w
      from public.bot_market_state s
      join public.markets m on m.id = s.market_id and m.status = 'open'
      left join (
        select market_id, sum(price * size) as vol24
        from public.trades
        where created_at > now() - interval '24 hours'
        group by market_id
      ) v on v.market_id = s.market_id
    ) w
    order by power(random(), 1.0 / w.w) desc
    limit p_rounds
  loop
    select * into v_state from public.bot_market_state where market_id = v_market.market_id for update;

    -- news shock: rare, kicks momentum and heat — the market starts trending
    if v_state.shock_until is null or v_state.shock_until < now() then
      if random() < 0.015 * v_cfg.aggression then
        v_state.momentum := (case when random() < 0.5 then 1 else -1 end) * (0.01 + random() * 0.03);
        v_state.heat := least(20, v_state.heat + 4 + random() * 6);
        v_state.shock_until := now() + ((2 + random() * 10) * interval '1 minute');
      end if;
    end if;

    -- evolve the hidden probability: momentum + noise, then decay both
    v_target := greatest(0.03, least(0.97,
      v_state.target
      + v_state.momentum
      + (random() - 0.5) * 0.012 * (1 + least(v_state.heat, 8) * 0.15)));
    v_state.momentum := v_state.momentum * 0.88;
    v_state.heat := greatest(1, v_state.heat * 0.96);

    update public.bot_market_state
      set target = v_target, momentum = v_state.momentum, heat = v_state.heat,
          shock_until = v_state.shock_until, updated_at = now()
      where market_id = v_market.market_id;

    -- retire quotes this engine no longer stands behind
    for v_order in
      select o.id, o.user_id from public.orders o
      join public.bot_traders b on b.user_id = o.user_id
      where o.market_id = v_market.market_id and o.status in ('open', 'partial')
        and o.created_at < now() - interval '3 minutes'
    loop
      perform public.bot_impersonate(v_order.user_id);
      perform public.cancel_order(v_order.id);
    end loop;

    -- layered maker quotes: two price levels per side, deeper = bigger.
    -- A YES bid and a NO bid are the two sides of the unified YES-terms book.
    v_half := 0.01 + random() * 0.02;
    for v_level in 0..1 loop
      v_bid := round(greatest(0.02, least(0.96, v_target - v_half - v_level * 0.01))::numeric, 2);
      v_ask := round(greatest(v_bid + 0.02, least(0.98, v_target + v_half + v_level * 0.01))::numeric, 2);

      select user_id into v_maker from public.bot_traders order by random() limit 1;
      perform public.bot_impersonate(v_maker);
      perform public.place_order(v_market.market_id, 'YES', 'BUY', v_bid,
        round((exp(3.4 + random() * 2.2) * (1 + v_level))::numeric, 2));

      select user_id into v_maker from public.bot_traders order by random() limit 1;
      perform public.bot_impersonate(v_maker);
      perform public.place_order(v_market.market_id, 'NO', 'BUY', round(1 - v_ask, 2),
        round((exp(3.4 + random() * 2.2) * (1 + v_level))::numeric, 2));
    end loop;

    -- takers: hotter market → more crossings; momentum biases direction so
    -- prints chase the trend
    v_takes := floor(random() * (1 + least(v_state.heat, 6) * 0.5 * v_cfg.aggression))::int;
    v_up_bias := 0.5 + greatest(-0.3, least(0.3, v_state.momentum * 12));

    for v_level in 1..v_takes loop
      select user_id into v_taker from public.bot_traders order by random() limit 1;
      perform public.bot_impersonate(v_taker);
      v_size := round(exp(3.0 + random() * 2.4)::numeric, 2);

      if random() < v_up_bias then
        perform public.place_order(v_market.market_id, 'YES', 'BUY',
          least(0.98, round(v_target + v_half + 0.03, 2)), v_size, true);
      else
        select coalesce(shares, 0) into v_shares from public.positions
          where user_id = v_taker and market_id = v_market.market_id and outcome = 'YES';
        if coalesce(v_shares, 0) > 25 and random() < 0.5 then
          perform public.place_order(v_market.market_id, 'YES', 'SELL',
            greatest(0.02, round(v_target - v_half - 0.03, 2)), least(v_shares, v_size), true);
        else
          perform public.place_order(v_market.market_id, 'NO', 'BUY',
            least(0.98, round(1 - v_target + v_half + 0.03, 2)), v_size, true);
        end if;
      end if;
      v_prints := v_prints + 1;
    end loop;
  end loop;

  perform set_config('request.jwt.claims', '', true);
  return v_prints;
end;
$$;

-- cron entrypoint
create or replace function public.bot_tick()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg record;
begin
  select * into v_cfg from public.bot_config where id = 1;
  if v_cfg is null or not v_cfg.enabled then
    return;
  end if;
  perform public.bot_burst(v_cfg.burst_markets);
end;
$$;

-- ── command-centre RPCs (admin-gated, callable from the app) ───────────

create or replace function public.bot_status()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_cfg record;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'admin only';
  end if;
  select * into v_cfg from public.bot_config where id = 1;

  return jsonb_build_object(
    'enabled', v_cfg.enabled,
    'aggression', v_cfg.aggression,
    'burst_markets', v_cfg.burst_markets,
    'bots', (select count(*) from public.bot_traders),
    'resting_orders', (select count(*) from public.orders o
                         join public.bot_traders b on b.user_id = o.user_id
                        where o.status in ('open', 'partial')),
    'trades_1h', (select count(*) from public.trades where created_at > now() - interval '1 hour'),
    'trades_24h', (select count(*) from public.trades where created_at > now() - interval '24 hours'),
    'volume_24h', (select coalesce(sum(price * size), 0) from public.trades
                    where created_at > now() - interval '24 hours'),
    'trending', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'market_id', t.market_id, 'question', t.question,
               'heat', t.heat, 'vol24', t.vol24) order by t.rank), '[]'::jsonb)
      from (
        select s.market_id, m.question, round(s.heat, 1) as heat,
               round(coalesce(v.vol24, 0)) as vol24,
               row_number() over (order by s.heat * (1 + coalesce(v.vol24, 0)) desc) as rank
        from public.bot_market_state s
        join public.markets m on m.id = s.market_id and m.status = 'open'
        left join (
          select market_id, sum(price * size) as vol24 from public.trades
          where created_at > now() - interval '24 hours' group by market_id
        ) v on v.market_id = s.market_id
        order by s.heat * (1 + coalesce(v.vol24, 0)) desc
        limit 5
      ) t
    )
  );
end;
$$;

create or replace function public.bot_command(p_action text, p_value numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prints int;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'admin only';
  end if;

  if p_action = 'pause' then
    update public.bot_config set enabled = false, updated_at = now() where id = 1;
  elsif p_action = 'resume' then
    update public.bot_config set enabled = true, updated_at = now() where id = 1;
  elsif p_action = 'aggression' then
    if p_value is null or p_value < 0.10 or p_value > 5.00 then
      raise exception 'aggression must be between 0.1 and 5';
    end if;
    update public.bot_config set aggression = p_value, updated_at = now() where id = 1;
  elsif p_action = 'burst' then
    -- manual burst ignores the pause switch: the operator asked for it
    v_prints := (
      select public.bot_burst(coalesce(nullif(floor(coalesce(p_value, 8))::int, 0), 8))
    );
    return jsonb_build_object('ok', true, 'prints', v_prints);
  else
    raise exception 'unknown action %', p_action;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- bot_burst stays operator-only; the command RPCs do their own admin check
revoke execute on function public.bot_burst(int) from public, anon, authenticated;
revoke execute on function public.bot_status() from public, anon;
revoke execute on function public.bot_command(text, numeric) from public, anon;
grant execute on function public.bot_status() to authenticated;
grant execute on function public.bot_command(text, numeric) to authenticated;

-- ── reschedule: 1-minute tick → 15-second HFT cadence ─────────────────

do $$
begin
  if exists (select 1 from cron.job where jobname = 'kalo-bot-tick') then
    perform cron.unschedule('kalo-bot-tick');
  end if;
  if not exists (select 1 from cron.job where jobname = 'kalo-bot-hft') then
    perform cron.schedule('kalo-bot-hft', '15 seconds', 'select public.bot_tick()');
  end if;
end;
$$;
