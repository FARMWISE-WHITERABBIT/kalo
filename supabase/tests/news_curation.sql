-- News engine + curation suite (0014/0015): ingest -> impact -> shock ->
-- proposal -> superadmin approval (checklist enforced) -> market; and
-- resolution suggestion -> accept -> resolve with I7 snapshot. Persona burst
-- and all invariants re-verified at the end.

do $$
declare
  admin_u uuid := kalo_test.mk_user('curator');
  pleb uuid := kalo_test.mk_user('pleb');
  news_id bigint;
  good_id bigint;
  bad_id bigint;
  sug_id bigint;
  mkt uuid;
  r jsonb;
begin
  update public.profiles set is_admin = true where id = admin_u;

  -- ingest a synthetic item and apply an impact with a proposal
  news_id := public.news_ingest('Test Wire', 'https://test.kalo.local/' || gen_random_uuid(),
    'Central bank signals rate cut in September', 'Officials hinted strongly.', 'Economics', now());
  perform public.news_apply_impact(
    news_id,
    '[{"category":"Economics","sentiment":0.6,"strength":0.8}]'::jsonb,
    (select coalesce(jsonb_agg(jsonb_build_object('market_id', m.id, 'direction', 0.7, 'strength', 0.9)), '[]'::jsonb)
       from (select id from public.markets where status = 'open' and category = 'Economics' limit 1) m),
    jsonb_build_object(
      'question', 'Will the central bank cut rates at the September meeting?',
      'criteria', 'Resolves YES if the central bank announces a policy rate cut at its September meeting, per the bank''s official statement; otherwise NO.',
      'category', 'Economics',
      'close_at', (now() + interval '30 days')::text),
    null, 'llm');

  select id into good_id from public.market_proposals where news_item_id = news_id;
  perform kalo_test.check(good_id is not null, 'impact filed a pending proposal');

  perform kalo_test.check(
    exists (select 1 from public.bot_market_state s
             join public.markets m on m.id = s.market_id and m.category = 'Economics'
             where s.heat > 5 and s.momentum > 0),
    'impact shocked the matched market (heat + momentum)');

  -- non-admin cannot approve
  perform kalo_test.act_as(pleb);
  perform kalo_test.expect_error(
    format('select public.approve_market_proposal(%s)', good_id), 'non-admin approval');

  -- §8.7 checklist: a criteria-less proposal must be rejected at approval
  insert into public.market_proposals (question, criteria, category, source_url, suggested_close_at)
    values ('Will something vague happen soon?', 'tbd', 'General', 'https://example.com', now() + interval '10 days')
    returning id into bad_id;
  perform kalo_test.act_as(admin_u);
  perform kalo_test.expect_error(
    format('select public.approve_market_proposal(%s)', bad_id), 'checklist-failing proposal');

  -- approval creates a live market from the good proposal
  mkt := public.approve_market_proposal(good_id);
  perform kalo_test.check(
    (select status from public.markets where id = mkt) = 'open'
    and (select status from public.market_proposals where id = good_id) = 'approved',
    'approval created an open market and closed the proposal');

  -- resolution suggestion -> accept routes through resolve_market (I7)
  news_id := public.news_ingest('Test Wire', 'https://test.kalo.local/' || gen_random_uuid(),
    'Central bank cuts rates', 'It happened.', 'Economics', now());
  perform public.news_apply_impact(news_id, '[]'::jsonb, '[]'::jsonb, null,
    jsonb_build_object('market_id', mkt, 'outcome', 'YES', 'rationale', 'Official announcement'), 'llm');
  select id into sug_id from public.resolution_suggestions where market_id = mkt and status = 'pending';
  perform kalo_test.check(sug_id is not null, 'resolution suggestion filed');

  perform public.accept_resolution_suggestion(sug_id);
  perform kalo_test.check(
    (select status from public.markets where id = mkt) = 'resolved'
    and exists (select 1 from public.market_resolution where market_id = mkt),
    'accepted suggestion resolved the market with an I7 snapshot');

  -- persona-aware burst still prints with the fleet
  perform kalo_test.check(public.bot_burst(6) >= 0, 'persona burst runs');
  r := public.invariant_report();
  perform kalo_test.check((r->>'ok')::boolean, 'all invariants green (I1-I7)');

  perform set_config('request.jwt.claims', '', true);
  raise notice 'news_curation: ALL CHECKS PASSED';
end;
$$;
