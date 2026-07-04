-- Persona bot fleet + news engine substrate. What and why:
--
-- FLEET: bots become persona traders. Each bot carries interests (the
-- category audiences it trades), risk appetite (position sizing), a
-- contrarian tendency (probability of fading the trend rather than chasing
-- it), and an activity level (how often it acts). bot_provision_fleet(n)
-- provisions up to 1000 bots at exactly $10,000 each, minted through the
-- ledger (signup grant 1,000 + fleet grant 9,000) so I1 holds. Legacy bots
-- are rebased to the same $10,000 free-cash level with an explicit negative
-- ledger entry (burn), keeping I1 exact.
--
-- NEWS ENGINE SUBSTRATE: the news-engine Edge Function ingests items from
-- RSS/news sources (X pluggable later), scores each item ONCE (Claude when
-- ANTHROPIC_API_KEY is configured, keyword fallback otherwise), and calls
-- news_apply_impact() which:
--   * records the impact,
--   * converts it into targeted momentum/heat shocks on matched markets —
--     replacing the engine's random news shocks with real ones,
--   * files market proposals and resolution suggestions for the superadmin.
-- NOTHING goes live without approval: approve_market_proposal() enforces the
-- §8.7 curation checklist (question, resolution criteria, named source,
-- cutoff); accept_resolution_suggestion() routes through resolve_market with
-- its admin check and I7 snapshot.
--
-- ENGINE: bot_burst v3 becomes persona-aware — makers/takers are drawn from
-- bots interested in the market's category (activity-weighted), direction
-- bias respects each bot's contrarian tendency, sizes scale with risk
-- appetite, and the faucet tops fleet bots back toward their $10k bankroll.
-- Random background shocks drop to 0.5% (news is now the shock source).

-- ── personas ─────────────────────────────────────────────────────────────

alter table public.bot_traders
  add column interests text[] not null default '{}',
  add column risk numeric(3, 2) not null default 0.50 check (risk >= 0 and risk <= 1),
  add column contrarian numeric(3, 2) not null default 0.15 check (contrarian >= 0 and contrarian <= 1),
  add column activity numeric(3, 2) not null default 0.50 check (activity > 0 and activity <= 1);

create or replace function public.bot_provision_fleet(p_count int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first text[] := array['ada','bayo','chidi','dara','eno','femi','gozie','hauwa','ify','jide',
    'kemi','lanre','musa','ngozi','obi','pelumi','remi','sade','tunde','uche','wale','yemi',
    'zara','amara','biko','chuka','dupe','eze','folake','gbenga','halima','imani','juwon',
    'kunbi','lola','mide','nneka','ola','peju','rotimi','seyi','tayo','uzo','wunmi','yinka',
    'zainab','deji','efe','funmi','kola'];
  v_archetypes jsonb := '[
    {"persona":"crypto_degen",    "interests":["Crypto","Tech","Economics"],       "risk":[0.6,1.0], "contrarian":[0.05,0.3], "activity":[0.5,1.0]},
    {"persona":"politics_junkie", "interests":["Politics","Geopolitics"],          "risk":[0.3,0.8], "contrarian":[0.1,0.5],  "activity":[0.4,0.9]},
    {"persona":"sports_fan",      "interests":["Sports","World Cup"],              "risk":[0.4,0.9], "contrarian":[0.05,0.25],"activity":[0.5,1.0]},
    {"persona":"macro_watcher",   "interests":["Economics","Geopolitics","Tech"],  "risk":[0.1,0.5], "contrarian":[0.2,0.6],  "activity":[0.2,0.6]},
    {"persona":"culture_vulture", "interests":["Culture","Tech","Sports"],         "risk":[0.3,0.8], "contrarian":[0.05,0.35],"activity":[0.3,0.8]},
    {"persona":"generalist",      "interests":["Politics","Crypto","Sports","Economics","Tech","Culture","Geopolitics","World Cup"], "risk":[0.2,0.8], "contrarian":[0.1,0.4], "activity":[0.2,0.7]}
  ]'::jsonb;
  v_arch jsonb;
  v_interests text[];
  v_name text;
  v_id uuid;
  v_created int := 0;
  v_existing int;
  i int;
  span numeric;
begin
  select count(*) into v_existing from public.bot_traders;
  if v_existing + p_count > 1000 then
    p_count := greatest(0, 1000 - v_existing);
  end if;

  for i in 1..p_count loop
    v_arch := v_archetypes -> floor(random() * jsonb_array_length(v_archetypes))::int;
    -- generalists sample 3 of their pool; others take the full small pool
    select case when v_arch->>'persona' = 'generalist'
      then (select array_agg(x) from (
        select x from jsonb_array_elements_text(v_arch->'interests') as t(x)
        order by random() limit 3) s)
      else (select array_agg(x) from jsonb_array_elements_text(v_arch->'interests') as t(x))
    end into v_interests;

    v_name := v_first[1 + floor(random() * array_length(v_first, 1))::int]
              || '_' || (100 + floor(random() * 900))::int;
    v_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      'fleet-' || v_name || '-' || substr(v_id::text, 1, 6) || '@bots.kalo.local',
      '!disabled-login!', now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('display_name', v_name),
      now(), now(), '', '', '', ''
    );

    span := (v_arch->'risk'->>1)::numeric - (v_arch->'risk'->>0)::numeric;
    insert into public.bot_traders (user_id, persona, interests, risk, contrarian, activity)
    values (
      v_id, v_arch->>'persona', v_interests,
      round(((v_arch->'risk'->>0)::numeric + random() * span)::numeric, 2),
      round(((v_arch->'contrarian'->>0)::numeric + random() * ((v_arch->'contrarian'->>1)::numeric - (v_arch->'contrarian'->>0)::numeric))::numeric, 2),
      round(greatest(0.05, (v_arch->'activity'->>0)::numeric + random() * ((v_arch->'activity'->>1)::numeric - (v_arch->'activity'->>0)::numeric))::numeric, 2)
    );

    -- signup trigger granted 1,000; top to the fleet bankroll of 10,000
    perform public.grant_play_money(v_id, 9000.00, 'fleet_grant');
    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

-- rebase legacy bots to the fleet bankroll: burn excess free cash with an
-- explicit negative ledger entry so I1 stays exact (positions are untouched)
insert into public.mint_ledger (user_id, amount, reason)
select p.id, 10000 - p.balance, 'bot_rebase_to_fleet'
from public.profiles p
join public.bot_traders b on b.user_id = p.id
where p.balance > 10000;

update public.profiles p
set balance = 10000
from public.bot_traders b
where b.user_id = p.id and p.balance > 10000;

-- give legacy bots personas too
update public.bot_traders set
  persona = 'generalist',
  interests = array['Politics','Crypto','Sports','Economics','Tech','Culture','Geopolitics','World Cup'],
  risk = 0.5, contrarian = 0.2, activity = 0.6
where persona = 'mixed';

-- ── news substrate ───────────────────────────────────────────────────────

create table public.news_items (
  id bigint generated always as identity primary key,
  source text not null,
  url text not null unique,
  title text not null,
  summary text,
  category_hint text,
  published_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'scored', 'skipped')),
  fetched_at timestamptz not null default now()
);
create index news_items_status_idx on public.news_items (status, fetched_at desc);
alter table public.news_items enable row level security;
create policy "news readable" on public.news_items for select using (true);
grant select on public.news_items to authenticated, anon;

create table public.news_impacts (
  id bigint generated always as identity primary key,
  news_item_id bigint not null references public.news_items (id) on delete cascade,
  audiences jsonb not null default '[]',        -- [{category, sentiment, strength}]
  matched_markets jsonb not null default '[]',  -- [{market_id, direction, strength}]
  scored_by text not null default 'keywords',   -- 'llm' | 'keywords'
  created_at timestamptz not null default now()
);
alter table public.news_impacts enable row level security;

create table public.market_proposals (
  id bigint generated always as identity primary key,
  news_item_id bigint references public.news_items (id) on delete set null,
  question text not null,
  criteria text not null,
  category text not null,
  source_url text not null,
  suggested_close_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_market_id uuid references public.markets (id),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index market_proposals_status_idx on public.market_proposals (status, created_at desc);
alter table public.market_proposals enable row level security;

create table public.resolution_suggestions (
  id bigint generated always as identity primary key,
  market_id uuid not null references public.markets (id) on delete cascade,
  news_item_id bigint references public.news_items (id) on delete set null,
  suggested_outcome text not null check (suggested_outcome in ('YES', 'NO')),
  rationale text not null,
  evidence_url text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed')),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index resolution_suggestions_status_idx on public.resolution_suggestions (status, created_at desc);
alter table public.resolution_suggestions enable row level security;

-- ingest: dedupe on url; called by the news-engine function (service role)
create or replace function public.news_ingest(
  p_source text, p_url text, p_title text, p_summary text,
  p_category_hint text, p_published_at timestamptz
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  insert into public.news_items (source, url, title, summary, category_hint, published_at)
    values (p_source, p_url, left(p_title, 500), left(p_summary, 2000), p_category_hint, p_published_at)
    on conflict (url) do nothing
    returning id into v_id;
  return v_id;  -- null when already ingested
end;
$$;

-- apply a scored impact: record it, shock matched markets, file proposals
-- and resolution suggestions. All human-facing effects stay pending until a
-- superadmin acts on them; only bot market-state (momentum/heat) moves.
create or replace function public.news_apply_impact(
  p_news_id bigint,
  p_audiences jsonb,
  p_matched jsonb,
  p_proposal jsonb default null,
  p_resolution jsonb default null,
  p_scored_by text default 'keywords'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m jsonb;
  v_dir numeric;
  v_strength numeric;
  v_market uuid;
begin
  if not exists (select 1 from public.news_items where id = p_news_id) then
    raise exception 'unknown news item %', p_news_id;
  end if;

  insert into public.news_impacts (news_item_id, audiences, matched_markets, scored_by)
    values (p_news_id, coalesce(p_audiences, '[]'), coalesce(p_matched, '[]'), p_scored_by);

  -- targeted shocks: news replaces the engine's random shock source
  for v_m in select * from jsonb_array_elements(coalesce(p_matched, '[]'))
  loop
    v_market := (v_m->>'market_id')::uuid;
    v_dir := greatest(-1, least(1, coalesce((v_m->>'direction')::numeric, 0)));
    v_strength := greatest(0, least(1, coalesce((v_m->>'strength')::numeric, 0)));
    if v_strength > 0 then
      update public.bot_market_state set
        momentum = greatest(-0.06, least(0.06, momentum + v_dir * v_strength * 0.04)),
        heat = least(20, heat + v_strength * 8),
        shock_until = greatest(coalesce(shock_until, now()), now() + (v_strength * interval '10 minutes')),
        updated_at = now()
      where market_id = v_market;
    end if;
  end loop;

  if p_proposal is not null
     and coalesce(p_proposal->>'question', '') <> ''
     and not exists (select 1 from public.market_proposals
                      where question = p_proposal->>'question' and status in ('pending', 'approved'))
     and not exists (select 1 from public.markets where question = p_proposal->>'question') then
    insert into public.market_proposals (news_item_id, question, criteria, category, source_url, suggested_close_at)
    values (
      p_news_id,
      p_proposal->>'question',
      coalesce(p_proposal->>'criteria', ''),
      coalesce(p_proposal->>'category', 'General'),
      coalesce(p_proposal->>'source_url', (select url from public.news_items where id = p_news_id)),
      nullif(p_proposal->>'close_at', '')::timestamptz
    );
  end if;

  if p_resolution is not null and (p_resolution->>'market_id') is not null then
    v_market := (p_resolution->>'market_id')::uuid;
    if exists (select 1 from public.markets where id = v_market and status in ('open', 'closed'))
       and (p_resolution->>'outcome') in ('YES', 'NO')
       and not exists (select 1 from public.resolution_suggestions
                        where market_id = v_market and status = 'pending') then
      insert into public.resolution_suggestions (market_id, news_item_id, suggested_outcome, rationale, evidence_url)
      values (
        v_market, p_news_id, p_resolution->>'outcome',
        coalesce(p_resolution->>'rationale', ''),
        coalesce(p_resolution->>'evidence_url', (select url from public.news_items where id = p_news_id))
      );
    end if;
  end if;

  update public.news_items set status = 'scored' where id = p_news_id;
end;
$$;

create or replace function public.news_skip(p_news_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.news_items set status = 'skipped' where id = p_news_id;
$$;

-- ── superadmin curation RPCs (§8.7 checklist enforced) ──────────────────

create or replace function public.approve_market_proposal(p_proposal_id bigint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_p record;
  v_market uuid;
begin
  if not exists (select 1 from public.profiles where id = v_user and is_admin) then
    raise exception 'admin only';
  end if;
  select * into v_p from public.market_proposals where id = p_proposal_id and status = 'pending' for update;
  if not found then
    raise exception 'proposal not pending';
  end if;

  -- curation checklist: unambiguous question, stated criteria, named public
  -- source, and a real cutoff — reject listings failing it
  if length(trim(v_p.question)) < 10 or length(trim(v_p.criteria)) < 20
     or coalesce(v_p.source_url, '') = ''
     or v_p.suggested_close_at is null or v_p.suggested_close_at <= now() then
    raise exception 'curation checklist failed: question, resolution criteria, source, and future cutoff are required';
  end if;

  insert into public.markets (question, description, category, close_at, status, created_by)
    values (v_p.question, v_p.criteria || E'\n\nSource: ' || v_p.source_url,
            v_p.category, v_p.suggested_close_at, 'open', v_user)
    returning id into v_market;

  update public.market_proposals
    set status = 'approved', created_market_id = v_market, reviewed_by = v_user, reviewed_at = now()
    where id = p_proposal_id;

  return v_market;
end;
$$;

create or replace function public.reject_market_proposal(p_proposal_id bigint)
returns void
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
  update public.market_proposals
    set status = 'rejected', reviewed_by = v_user, reviewed_at = now()
    where id = p_proposal_id and status = 'pending';
  if not found then
    raise exception 'proposal not pending';
  end if;
end;
$$;

create or replace function public.accept_resolution_suggestion(p_suggestion_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_s record;
begin
  if not exists (select 1 from public.profiles where id = v_user and is_admin) then
    raise exception 'admin only';
  end if;
  select * into v_s from public.resolution_suggestions where id = p_suggestion_id and status = 'pending' for update;
  if not found then
    raise exception 'suggestion not pending';
  end if;

  -- routes through resolve_market: admin check, advisory lock, flush,
  -- auto-redemption, I7 snapshot all apply
  perform public.resolve_market(v_s.market_id, v_s.suggested_outcome);

  update public.resolution_suggestions
    set status = 'accepted', reviewed_by = v_user, reviewed_at = now()
    where id = p_suggestion_id;
end;
$$;

create or replace function public.dismiss_resolution_suggestion(p_suggestion_id bigint)
returns void
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
  update public.resolution_suggestions
    set status = 'dismissed', reviewed_by = v_user, reviewed_at = now()
    where id = p_suggestion_id and status = 'pending';
  if not found then
    raise exception 'suggestion not pending';
  end if;
end;
$$;

-- admin read surface for the Command Centre queue
create or replace function public.curation_queue()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'admin only';
  end if;
  return jsonb_build_object(
    'proposals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'question', p.question, 'criteria', p.criteria,
        'category', p.category, 'source_url', p.source_url,
        'close_at', p.suggested_close_at, 'created_at', p.created_at)
        order by p.created_at desc)
      from public.market_proposals p where p.status = 'pending'), '[]'::jsonb),
    'resolutions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'market_id', s.market_id, 'question', m.question,
        'outcome', s.suggested_outcome, 'rationale', s.rationale,
        'evidence_url', s.evidence_url, 'created_at', s.created_at)
        order by s.created_at desc)
      from public.resolution_suggestions s
      join public.markets m on m.id = s.market_id
      where s.status = 'pending'), '[]'::jsonb),
    'news_24h', (select count(*) from public.news_items where fetched_at > now() - interval '24 hours'),
    'fleet', (select count(*) from public.bot_traders)
  );
end;
$$;

-- ── bot_burst v3: persona-aware, news-driven ────────────────────────────

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
  v_taker record;
  v_level int;
  v_takes int;
  v_size numeric;
  v_shares numeric;
  v_up_bias numeric;
  v_bias numeric;
  v_prints int := 0;
begin
  select * into v_cfg from public.bot_config where id = 1;
  if v_cfg is null or not exists (select 1 from public.bot_traders) then
    return 0;
  end if;

  -- faucet: keep fleet bots near their $10k bankroll (ledgered, I1)
  for v_bot in
    select p.id, p.balance from public.profiles p
    join public.bot_traders b on b.user_id = p.id
    where p.balance < 2000
  loop
    perform public.grant_play_money(v_bot.id, 10000 - v_bot.balance, 'bot_faucet');
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
    select w.market_id, w.category
    from (
      select s.market_id, m.category,
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

    -- residual random shocks at 0.5%: news_apply_impact is the shock source now
    if v_state.shock_until is null or v_state.shock_until < now() then
      if random() < 0.005 * v_cfg.aggression then
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

    -- makers: interested bots quote (activity-weighted); fall back to anyone
    v_half := 0.01 + random() * 0.02;
    for v_level in 0..1 loop
      v_bid := round(greatest(0.02, least(0.96, v_target - v_half - v_level * 0.01))::numeric, 2);
      v_ask := round(greatest(v_bid + 0.02, least(0.98, v_target + v_half + v_level * 0.01))::numeric, 2);

      select user_id into v_maker from public.bot_traders
        where v_market.category is null or interests = '{}' or v_market.category = any(interests)
        order by power(random(), 1.0 / activity) desc limit 1;
      if v_maker is null then
        select user_id into v_maker from public.bot_traders order by random() limit 1;
      end if;
      perform public.bot_impersonate(v_maker);
      perform public.place_order(v_market.market_id, 'YES', 'BUY', v_bid,
        round((exp(3.2 + random() * 2.0) * (1 + v_level))::numeric, 2));

      select user_id into v_maker from public.bot_traders
        where v_market.category is null or interests = '{}' or v_market.category = any(interests)
        order by power(random(), 1.0 / activity) desc limit 1;
      perform public.bot_impersonate(v_maker);
      perform public.place_order(v_market.market_id, 'NO', 'BUY', round(1 - v_ask, 2),
        round((exp(3.2 + random() * 2.0) * (1 + v_level))::numeric, 2));
    end loop;

    -- takers: interested bots cross; hotter market -> more of them
    v_takes := floor(random() * (1 + least(v_state.heat, 6) * 0.5 * v_cfg.aggression))::int;
    v_up_bias := 0.5 + greatest(-0.3, least(0.3, v_state.momentum * 12));

    for v_level in 1..v_takes loop
      select user_id, risk, contrarian into v_taker from public.bot_traders
        where v_market.category is null or interests = '{}' or v_market.category = any(interests)
        order by power(random(), 1.0 / activity) desc limit 1;
      exit when v_taker is null;
      perform public.bot_impersonate(v_taker.user_id);

      -- contrarians fade the trend instead of chasing it
      v_bias := case when random() < v_taker.contrarian
                  then 1 - v_up_bias else v_up_bias end;
      -- risk appetite scales position size
      v_size := round((exp(2.6 + random() * 2.2) * (0.4 + v_taker.risk))::numeric, 2);
      if v_size < 1 then v_size := 1.00; end if;

      if random() < v_bias then
        perform public.place_order(v_market.market_id, 'YES', 'BUY',
          least(0.98, round(v_target + v_half + 0.03, 2)), v_size, true);
      else
        select coalesce(shares, 0) into v_shares from public.positions
          where user_id = v_taker.user_id and market_id = v_market.market_id and outcome = 'YES';
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

-- ── grants ───────────────────────────────────────────────────────────────

revoke execute on function public.bot_provision_fleet(int) from public, anon, authenticated;
revoke execute on function public.news_ingest(text, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.news_apply_impact(bigint, jsonb, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
revoke execute on function public.news_skip(bigint) from public, anon, authenticated;
grant execute on function public.news_ingest(text, text, text, text, text, timestamptz) to service_role;
grant execute on function public.news_apply_impact(bigint, jsonb, jsonb, jsonb, jsonb, text) to service_role;
grant execute on function public.news_skip(bigint) to service_role;

revoke execute on function public.approve_market_proposal(bigint) from public, anon;
revoke execute on function public.reject_market_proposal(bigint) from public, anon;
revoke execute on function public.accept_resolution_suggestion(bigint) from public, anon;
revoke execute on function public.dismiss_resolution_suggestion(bigint) from public, anon;
revoke execute on function public.curation_queue() from public, anon;
grant execute on function public.approve_market_proposal(bigint) to authenticated;
grant execute on function public.reject_market_proposal(bigint) to authenticated;
grant execute on function public.accept_resolution_suggestion(bigint) to authenticated;
grant execute on function public.dismiss_resolution_suggestion(bigint) to authenticated;
grant execute on function public.curation_queue() to authenticated;
