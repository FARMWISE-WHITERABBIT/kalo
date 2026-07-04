-- M1: mint ledger + invariant suite (§4). What changed and why:
--
-- I1 (cash conservation) is only checkable if "total play money ever minted"
-- is a first-class quantity. Until now grants happened as ad-hoc balance
-- UPDATEs (signup trigger, bot provisioning, bot faucet), so the right-hand
-- side of I1 was unknowable. This migration:
--
--   * adds mint_ledger — an append-only record of every grant. user_id is
--     nullable for system entries.
--   * routes all future grants through grant_play_money(): the signup
--     trigger, bot provisioning, and the bot faucet (bot_burst is re-created
--     with the faucet section rewritten; the trading logic is unchanged from
--     0004).
--   * inserts one 'baseline_pre_ledger' entry equal to the system value at
--     migration time, absorbing all historical grants and any pre-ledger
--     rounding drift so I1 holds exactly from this point forward.
--   * widens profiles.balance to numeric(14,4): prices (2dp) x sizes (2dp)
--     produce exact 4dp cash movements; a 2dp balance column silently rounded
--     them and leaked pennies.
--   * implements invariant_report() (I1/I2/I3/I6 as live SQL checks),
--     assert_invariants() (raises when red — for tests and on-demand use),
--     record_invariants() + invariant_runs (history), and a pg_cron schedule
--     running every 10 minutes against live data. I4/I5 are scenario
--     properties and live in supabase/tests/.
--
-- Collateral accounting: for open/closed markets, open interest = Σ YES
-- shares (positions + escrow in open SELL YES orders), which I2 asserts
-- equals the NO-side total. For resolved markets, outstanding collateral =
-- unredeemed winning-side shares (each redeems for exactly 1); the losing
-- side is dead weight and intentionally asymmetric after partial redemption.

-- ── ledger ──────────────────────────────────────────────────────────────

create table public.mint_ledger (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete set null,
  amount numeric(14, 4) not null,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.mint_ledger enable row level security;
-- no policies: operator/audit surface only

alter table public.profiles alter column balance type numeric(14, 4);

create or replace function public.grant_play_money(p_user uuid, p_amount numeric, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount <= 0 then
    raise exception 'grant must be positive';
  end if;
  insert into public.mint_ledger (user_id, amount, reason) values (p_user, p_amount, p_reason);
  update public.profiles set balance = balance + p_amount where id = p_user;
end;
$$;

-- signup grant now flows through the ledger
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
    0
  );
  perform public.grant_play_money(new.id, 1000.00, 'signup_grant');
  return new;
end;
$$;

-- bot provisioning grants through the ledger (signup trigger grants 1000
-- first; top up to the bot bankroll)
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
      '!disabled-login!',
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('display_name', v_name),
      now(), now(), '', '', '', ''
    );
    insert into public.bot_traders (user_id) values (v_id);
    perform public.grant_play_money(v_id, 249000.00, 'bot_grant');
    v_created := v_created + 1;
  end loop;
  return v_created;
end;
$$;

-- bot_burst v2.1: identical to 0004 except the faucet section, which now
-- mints through grant_play_money so I1 holds under continuous bot load.
create or replace function public.bot_burst(p_rounds int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg record;
  v_bot record;
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
  select * into v_cfg from public.bot_config where id = 1;
  if v_cfg is null or not exists (select 1 from public.bot_traders) then
    return 0;
  end if;

  -- play-money faucet, now via the mint ledger (I1)
  for v_bot in
    select p.id, p.balance from public.profiles p
    join public.bot_traders b on b.user_id = p.id
    where p.balance < 50000
  loop
    perform public.grant_play_money(v_bot.id, 250000 - v_bot.balance, 'bot_faucet');
  end loop;

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
        where created_at > now() - interval '24 hours' and not is_seed
        group by market_id
      ) v on v.market_id = s.market_id
    ) w
    order by power(random(), 1.0 / w.w) desc
    limit p_rounds
  loop
    select * into v_state from public.bot_market_state where market_id = v_market.market_id for update;

    if v_state.shock_until is null or v_state.shock_until < now() then
      if random() < 0.015 * v_cfg.aggression then
        v_state.momentum := (case when random() < 0.5 then 1 else -1 end) * (0.01 + random() * 0.03);
        v_state.heat := least(20, v_state.heat + 4 + random() * 6);
        v_state.shock_until := now() + ((2 + random() * 10) * interval '1 minute');
      end if;
    end if;

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

    for v_order in
      select o.id, o.user_id from public.orders o
      join public.bot_traders b on b.user_id = o.user_id
      where o.market_id = v_market.market_id and o.status in ('open', 'partial')
        and o.created_at < now() - interval '3 minutes'
    loop
      perform public.bot_impersonate(v_order.user_id);
      perform public.cancel_order(v_order.id);
    end loop;

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

-- ── invariant suite ────────────────────────────────────────────────────

-- Shared measurement so the baseline entry and I1 use identical accounting.
create or replace function public.engine_totals()
returns table (cash numeric, buy_escrow numeric, collateral numeric)
language sql
security definer
set search_path = public
stable
as $$
  select
    (select coalesce(sum(balance), 0) from public.profiles),
    (select coalesce(sum(price * (size - filled_size)), 0)
       from public.orders where status in ('open', 'partial') and side = 'BUY'),
    (select coalesce(sum(
        case
          when m.status = 'resolved' then
            (select coalesce(sum(p.shares), 0) from public.positions p
              where p.market_id = m.id and p.outcome = m.resolved_outcome)
          else
            (select coalesce(sum(p.shares), 0) from public.positions p
              where p.market_id = m.id and p.outcome = 'YES')
            + (select coalesce(sum(o.size - o.filled_size), 0) from public.orders o
                where o.market_id = m.id and o.status in ('open', 'partial')
                  and o.side = 'SELL' and o.outcome = 'YES')
        end), 0)
     from public.markets m);
$$;

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

  v_ok := v_i1_delta = 0
      and v_i2 = '[]'::jsonb
      and v_i3_bal = 0 and v_i3_pos = 0 and v_i3_ord = 0
      and v_i6 = 0;

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
    'i6', jsonb_build_object('uncollateralized_trades', v_i6, 'ok', v_i6 = 0)
  );
end;
$$;

-- raises when red: for tests and on-demand checks
create or replace function public.assert_invariants()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report jsonb := public.invariant_report();
begin
  if not (v_report ->> 'ok')::boolean then
    raise exception 'INVARIANT VIOLATION: %', v_report;
  end if;
  return v_report;
end;
$$;

-- records history without raising: for the cron schedule
create table public.invariant_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  ok boolean not null,
  report jsonb not null
);
alter table public.invariant_runs enable row level security;

create or replace function public.record_invariants()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report jsonb := public.invariant_report();
begin
  insert into public.invariant_runs (ok, report)
    values ((v_report ->> 'ok')::boolean, v_report);
  return (v_report ->> 'ok')::boolean;
end;
$$;

revoke execute on function public.grant_play_money(uuid, numeric, text) from public, anon, authenticated;
revoke execute on function public.engine_totals() from public, anon, authenticated;
revoke execute on function public.invariant_report() from public, anon, authenticated;
revoke execute on function public.assert_invariants() from public, anon, authenticated;
revoke execute on function public.record_invariants() from public, anon, authenticated;

-- ── baseline: absorb all pre-ledger grants so I1 holds from now on ─────

insert into public.mint_ledger (user_id, amount, reason)
select null, t.cash + t.buy_escrow + t.collateral, 'baseline_pre_ledger'
from public.engine_totals() t;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'kalo-invariants') then
    perform cron.schedule('kalo-invariants', '*/10 * * * *', 'select public.record_invariants()');
  end if;
end;
$$;
