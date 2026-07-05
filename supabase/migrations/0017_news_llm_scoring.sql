-- Database-side LLM scoring for the news engine. Why this lives in Postgres:
-- the Edge Function redeploy path was unreliable through our tooling, and
-- pg_net gives the database the same async HTTP capability the cron already
-- uses — so the scoring brain moves here, reading the Anthropic key from
-- Vault via operator_secret() (0016). The Edge Function remains the RSS
-- ingester, and its keyword scoring becomes the fallback: this path CLAIMS
-- pending items (status 'scoring') on a 1-minute cadence, five times faster
-- than the function's 5-minute keyword pass, and releases them back to
-- 'pending' if the API call fails or times out, so degradation is graceful
-- and nothing is scored twice.
--
-- Two-phase async flow (pg_net requests are non-blocking):
--   news_llm_submit(n): claim up to n pending items, POST each to the
--     Anthropic Messages API (Haiku), remember the request ids.
--   news_llm_collect(): match completed responses, parse the model's JSON,
--     validate market ids, and hand off to news_apply_impact(..., 'llm');
--     non-200s release the item, unparseable output skips it, in-flight
--     requests older than 10 minutes are released.
--   news_llm_tick(): collect then submit; scheduled every minute. A no-op
--   when no key is stored in Vault.

alter table public.news_items drop constraint news_items_status_check;
alter table public.news_items add constraint news_items_status_check
  check (status in ('pending', 'scoring', 'scored', 'skipped'));

create table public.news_llm_requests (
  news_item_id bigint primary key references public.news_items (id) on delete cascade,
  request_id bigint not null,
  submitted_at timestamptz not null default now()
);
alter table public.news_llm_requests enable row level security;

create or replace function public.news_llm_submit(p_max int default 4)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := public.operator_secret('anthropic_api_key');
  v_markets text;
  v_item record;
  v_prompt text;
  v_req bigint;
  v_n int := 0;
begin
  if v_key is null or v_key = '' then
    return 0;
  end if;

  select string_agg(m.id || ' | ' || coalesce(m.category, 'General') || ' | ' || m.question, E'\n')
    into v_markets
    from public.markets m where m.status = 'open';

  for v_item in
    select id, title, summary, category_hint from public.news_items
      where status = 'pending'
      order by fetched_at desc
      limit greatest(1, least(p_max, 8))
  loop
    v_prompt :=
      'You score news for a play-money prediction market. Audience categories: '
      || 'Politics, Geopolitics, Sports, World Cup, Crypto, Tech, Economics, Culture.'
      || E'\n\nOpen markets (id | category | question):\n' || coalesce(v_markets, '(none)')
      || E'\n\nNews item (source category hint: ' || coalesce(v_item.category_hint, 'none') || '):'
      || E'\nTITLE: ' || v_item.title
      || E'\nSUMMARY: ' || coalesce(v_item.summary, '(none)')
      || E'\n\nReturn ONLY a JSON object:\n'
      || '{ "audiences":[{"category":"<one of the categories>","sentiment":-1..1,"strength":0..1}],'
      || ' "matched_markets":[{"market_id":"<uuid from list>","direction":-1..1,"strength":0..1}],'
      || ' "proposal": null | {"question":"Will ...? (binary, unambiguous)","criteria":"Resolves YES if ... per <named public source>; otherwise NO. Cutoff ...","category":"<category>","close_at":"<ISO datetime 3-60 days out>"},'
      || ' "resolution": null | {"market_id":"<uuid>","outcome":"YES"|"NO","rationale":"..."} }'
      || E'\ndirection: +1 pushes YES up. Only match genuinely related markets. Only propose a market'
      || ' for genuinely bet-worthy, verifiable near-term events. Only suggest a resolution if this'
      || ' news definitively settles a listed market. Be conservative: most items deserve'
      || ' strength <= 0.4 and no proposal.';

    v_req := net.http_post(
      url := 'https://api.anthropic.com/v1/messages',
      headers := jsonb_build_object(
        'x-api-key', v_key,
        'anthropic-version', '2023-06-01',
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'model', 'claude-haiku-4-5-20251001',
        'max_tokens', 800,
        'messages', jsonb_build_array(jsonb_build_object('role', 'user', 'content', v_prompt))
      ),
      timeout_milliseconds := 30000
    );

    insert into public.news_llm_requests (news_item_id, request_id) values (v_item.id, v_req);
    update public.news_items set status = 'scoring' where id = v_item.id;
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

create or replace function public.news_llm_collect()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r record;
  v_resp record;
  v_text text;
  v_json jsonb;
  v_n int := 0;
begin
  for v_r in select * from public.news_llm_requests loop
    select * into v_resp from net._http_response where id = v_r.request_id;

    if not found then
      -- still in flight; release stale claims so the keyword fallback runs
      if v_r.submitted_at < now() - interval '10 minutes' then
        update public.news_items set status = 'pending'
          where id = v_r.news_item_id and status = 'scoring';
        delete from public.news_llm_requests where news_item_id = v_r.news_item_id;
      end if;
      continue;
    end if;

    begin
      if v_resp.status_code = 200 then
        v_text := (v_resp.content::jsonb) -> 'content' -> 0 ->> 'text';
        v_json := substring(v_text from '{.*}')::jsonb;
        perform public.news_apply_impact(
          v_r.news_item_id,
          coalesce(v_json -> 'audiences', '[]'::jsonb),
          coalesce((
            select jsonb_agg(e) from jsonb_array_elements(coalesce(v_json -> 'matched_markets', '[]'::jsonb)) e
            where exists (select 1 from public.markets where id = (e ->> 'market_id')::uuid)
          ), '[]'::jsonb),
          case when v_json -> 'proposal' is null or v_json -> 'proposal' = 'null'::jsonb
               then null else v_json -> 'proposal' end,
          case when v_json -> 'resolution' is null or v_json -> 'resolution' = 'null'::jsonb then null
               when exists (select 1 from public.markets
                             where id = (v_json -> 'resolution' ->> 'market_id')::uuid)
               then v_json -> 'resolution'
               else null end,
          'llm'
        );
        v_n := v_n + 1;
      else
        -- API error (auth, rate limit, ...): release for the keyword fallback
        update public.news_items set status = 'pending'
          where id = v_r.news_item_id and status = 'scoring';
      end if;
    exception when others then
      -- unparseable model output: skip the item rather than loop forever
      perform public.news_skip(v_r.news_item_id);
    end;

    delete from public.news_llm_requests where news_item_id = v_r.news_item_id;
  end loop;

  return v_n;
end;
$$;

create or replace function public.news_llm_tick()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.news_llm_collect();
  perform public.news_llm_submit(4);
end;
$$;

revoke execute on function public.news_llm_submit(int) from public, anon, authenticated;
revoke execute on function public.news_llm_collect() from public, anon, authenticated;
revoke execute on function public.news_llm_tick() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'kalo-news-llm') then
    perform cron.schedule('kalo-news-llm', '* * * * *', 'select public.news_llm_tick()');
  end if;
end;
$$;
