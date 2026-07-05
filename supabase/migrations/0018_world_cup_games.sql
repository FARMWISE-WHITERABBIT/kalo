-- World Cup game engine. A "game" (fixture) is an event entity that GROUPS
-- independent binary markets — moneyline home/draw/away, goal spread, total
-- goals, both-teams-to-score — each an ordinary fully-collateralized YES/NO
-- market on the existing engine. This deliberately is NOT a multi-outcome
-- (negRisk) market: §10 of KALO_DEV_PROMPT forbids those in Phase 1, so the
-- three-way moneyline is a UI composition over three independent books whose
-- prices need not sum to 1. Every market trades, escrows, matches, and
-- resolves exactly like any other; the invariants see nothing new.
--
-- What ships here:
--   * games table (public read) + markets.game_id / market_kind / line
--   * create_game(...) — admin RPC: insert fixture, mint its market set with
--     §8.7-compliant resolution criteria, seed bot_market_state with priors
--     so the fleet quotes sensible odds from the first tick
--   * resolve_game(game, home_goals, away_goals) — admin RPC: records the
--     final score and resolves every linked market from it through
--     resolve_market (flush → verdict → auto-redeem → I7 snapshot)
--   * a seeded Round-of-32 slate of 12 fixtures over the coming week
--
-- Lifecycle: markets close at kickoff + 2h (in-play trading through full
-- time; close_due_markets flushes them), then resolve_game settles them
-- from the score in one call.

-- ── schema ───────────────────────────────────────────────────────────────

create table public.games (
  id uuid primary key default gen_random_uuid(),
  competition text not null default 'FIFA World Cup 2026',
  stage text not null default 'Group stage',
  home_team text not null,
  away_team text not null,
  home_code text not null check (char_length(home_code) = 3),
  away_code text not null check (char_length(away_code) = 3),
  kickoff_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'finished')),
  home_score int check (home_score >= 0),
  away_score int check (away_score >= 0),
  created_at timestamptz not null default now()
);

alter table public.games enable row level security;
create policy games_public_read on public.games for select to anon, authenticated using (true);

alter table public.markets
  add column game_id uuid references public.games (id) on delete set null,
  add column market_kind text check (market_kind in (
    'moneyline_home', 'moneyline_away', 'draw', 'spread_home', 'total_over', 'btts'
  )),
  add column line numeric(4, 2);

create index markets_game_idx on public.markets (game_id) where game_id is not null;

-- ── fixture + market-set creation ────────────────────────────────────────

-- Internal worker, no auth check: the admin wrapper and the seed block below
-- both route through here. Priors: p_home_prior / p_draw_prior are the
-- bootstrap win/draw probabilities the bot fleet quotes around until real
-- flow and news move them.
create or replace function public.wc_create_game(
  p_home_team text,
  p_away_team text,
  p_home_code text,
  p_away_code text,
  p_stage text,
  p_kickoff timestamptz,
  p_home_prior numeric,
  p_draw_prior numeric,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game uuid;
  v_close timestamptz := p_kickoff + interval '2 hours';
  v_fixture text := p_home_team || ' vs ' || p_away_team;
  v_source text := ' per the official FIFA match report on FIFA.com.'
    || ' Regulation time means 90 minutes plus stoppage; extra time and'
    || ' penalty shootouts do not count. If the match is abandoned and not'
    || ' completed within 48 hours of the scheduled kickoff, resolves NO.';
  v_away_prior numeric := 1 - p_home_prior - p_draw_prior;
  v_m uuid;
  v_spec record;
begin
  if p_home_prior <= 0 or p_draw_prior <= 0 or v_away_prior <= 0
     or p_home_prior + p_draw_prior >= 1 then
    raise exception 'priors must be in (0,1) and sum below 1';
  end if;

  insert into public.games (stage, home_team, away_team, home_code, away_code, kickoff_at)
    values (p_stage, p_home_team, p_away_team, upper(p_home_code), upper(p_away_code), p_kickoff)
    returning id into v_game;

  for v_spec in
    select * from (values
      ('moneyline_home', null::numeric,
        'Will ' || p_home_team || ' beat ' || p_away_team || '?',
        'Resolves YES if ' || p_home_team || ' wins the ' || p_stage || ' match ' || v_fixture
          || ' in regulation time' || v_source || ' A draw or ' || p_away_team || ' win resolves NO.',
        p_home_prior),
      ('moneyline_away', null::numeric,
        'Will ' || p_away_team || ' beat ' || p_home_team || '?',
        'Resolves YES if ' || p_away_team || ' wins the ' || p_stage || ' match ' || v_fixture
          || ' in regulation time' || v_source || ' A draw or ' || p_home_team || ' win resolves NO.',
        v_away_prior),
      ('draw', null::numeric,
        'Will ' || v_fixture || ' end in a draw?',
        'Resolves YES if the ' || p_stage || ' match ' || v_fixture
          || ' is level after regulation time' || v_source,
        p_draw_prior),
      ('spread_home', 1.5,
        'Will ' || p_home_team || ' beat ' || p_away_team || ' by 2+ goals?',
        'Resolves YES if ' || p_home_team || ' wins the ' || p_stage || ' match ' || v_fixture
          || ' by a margin of at least 2 goals in regulation time' || v_source,
        greatest(0.04, round(p_home_prior * 0.42, 2))),
      ('total_over', 2.5,
        'Will ' || v_fixture || ' produce 3+ goals?',
        'Resolves YES if the two teams combine for 3 or more goals in regulation time in the '
          || p_stage || ' match ' || v_fixture || v_source,
        0.52),
      ('btts', null::numeric,
        'Will both teams score in ' || v_fixture || '?',
        'Resolves YES if both ' || p_home_team || ' and ' || p_away_team
          || ' score at least one goal in regulation time in the ' || p_stage || ' match '
          || v_fixture || v_source,
        0.55)
    ) as t(kind, line, question, criteria, prior)
  loop
    insert into public.markets
        (question, description, category, close_at, status, created_by, game_id, market_kind, line)
      values
        (v_spec.question, v_spec.criteria, 'World Cup', v_close, 'open', p_created_by,
         v_game, v_spec.kind, v_spec.line)
      returning id into v_m;

    -- World Cup fixtures launch hot: the fleet quotes the prior immediately
    -- and the trending-weighted burst engine favors them from the start.
    insert into public.bot_market_state (market_id, target, heat)
      values (v_m, greatest(0.03, least(0.97, v_spec.prior)), 6);
  end loop;

  return v_game;
end;
$$;

revoke execute on function
  public.wc_create_game(text, text, text, text, text, timestamptz, numeric, numeric, uuid)
  from public, anon, authenticated;

create or replace function public.create_game(
  p_home_team text,
  p_away_team text,
  p_home_code text,
  p_away_code text,
  p_stage text,
  p_kickoff timestamptz,
  p_home_prior numeric,
  p_draw_prior numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if not exists (select 1 from public.profiles where id = v_user and is_admin) then
    raise exception 'admin only';
  end if;
  if p_kickoff <= now() then
    raise exception 'kickoff must be in the future';
  end if;
  if coalesce(trim(p_home_team), '') = '' or coalesce(trim(p_away_team), '') = '' then
    raise exception 'both teams required';
  end if;

  return public.wc_create_game(
    trim(p_home_team), trim(p_away_team), p_home_code, p_away_code,
    coalesce(nullif(trim(p_stage), ''), 'Group stage'), p_kickoff,
    p_home_prior, p_draw_prior, v_user);
end;
$$;

grant execute on function
  public.create_game(text, text, text, text, text, timestamptz, numeric, numeric)
  to authenticated;

-- ── score-driven resolution ──────────────────────────────────────────────

-- One call settles the whole fixture: record the final score, then derive
-- each linked market's verdict from it and route through resolve_market so
-- every market gets the standard flush → auto-redeem → I7 snapshot path.
create or replace function public.resolve_game(
  p_game_id uuid,
  p_home_goals int,
  p_away_goals int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game record;
  v_mkt record;
  v_out text;
begin
  if not exists (select 1 from public.profiles where id = v_user and is_admin) then
    raise exception 'admin only';
  end if;
  if p_home_goals < 0 or p_away_goals < 0 then
    raise exception 'invalid score';
  end if;

  select * into v_game from public.games where id = p_game_id for update;
  if not found then
    raise exception 'game not found';
  end if;
  if v_game.status = 'finished' then
    raise exception 'game already resolved';
  end if;

  update public.games
    set status = 'finished', home_score = p_home_goals, away_score = p_away_goals
    where id = p_game_id;

  for v_mkt in
    select id, market_kind, line from public.markets
      where game_id = p_game_id and status in ('open', 'closed') and market_kind is not null
  loop
    v_out := case v_mkt.market_kind
      when 'moneyline_home' then case when p_home_goals > p_away_goals then 'YES' else 'NO' end
      when 'moneyline_away' then case when p_away_goals > p_home_goals then 'YES' else 'NO' end
      when 'draw'           then case when p_home_goals = p_away_goals then 'YES' else 'NO' end
      when 'spread_home'    then case when p_home_goals - p_away_goals > v_mkt.line then 'YES' else 'NO' end
      when 'total_over'     then case when p_home_goals + p_away_goals > v_mkt.line then 'YES' else 'NO' end
      when 'btts'           then case when p_home_goals > 0 and p_away_goals > 0 then 'YES' else 'NO' end
    end;
    if v_out is not null then
      perform public.resolve_market(v_mkt.id, v_out);
    end if;
  end loop;
end;
$$;

grant execute on function public.resolve_game(uuid, int, int) to authenticated;

-- ── seed: Round-of-32 slate over the coming week ─────────────────────────

-- Fixture data is simulation content (this is a play-money exchange), minted
-- through the same worker as admin-created games so criteria, bot priors,
-- and lifecycle are identical. Kickoffs are relative to migration time so
-- the board is always live. created_by: the earliest admin, if any.
do $$
declare
  v_admin uuid;
  v_day timestamptz := date_trunc('day', now());
  v_f record;
begin
  select id into v_admin from public.profiles where is_admin order by created_at limit 1;

  for v_f in
    select * from (values
      ('Brazil',        'Norway',        'BRA', 'NOR', 1, 15, 0.54, 0.27),
      ('Mexico',        'England',       'MEX', 'ENG', 1, 18, 0.31, 0.31),
      ('Argentina',     'Nigeria',       'ARG', 'NGA', 1, 21, 0.55, 0.25),
      ('France',        'Senegal',       'FRA', 'SEN', 2, 15, 0.52, 0.26),
      ('Spain',         'Morocco',       'ESP', 'MAR', 2, 18, 0.48, 0.28),
      ('Germany',       'Japan',         'GER', 'JPN', 2, 21, 0.50, 0.26),
      ('Portugal',      'United States', 'POR', 'USA', 3, 15, 0.47, 0.27),
      ('Netherlands',   'Croatia',       'NED', 'CRO', 3, 18, 0.43, 0.29),
      ('Italy',         'Colombia',      'ITA', 'COL', 3, 21, 0.41, 0.30),
      ('Belgium',       'South Korea',   'BEL', 'KOR', 4, 15, 0.52, 0.25),
      ('Uruguay',       'Switzerland',   'URU', 'SUI', 4, 18, 0.39, 0.31),
      ('Ghana',         'Ecuador',       'GHA', 'ECU', 4, 21, 0.34, 0.32)
    ) as t(home, away, hc, ac, day_offset, hour, ph, pd)
  loop
    perform public.wc_create_game(
      v_f.home, v_f.away, v_f.hc, v_f.ac, 'Round of 32',
      v_day + make_interval(days => v_f.day_offset, hours => v_f.hour),
      v_f.ph, v_f.pd, v_admin);
  end loop;
end;
$$;
