-- P0-1 / P0-4 regression suite: unified-book best execution and self-trade
-- prevention. Every scenario here FAILS against the v2 engine (settlement-
-- kind priority) and passes against v3. Run wrapped in a transaction:
--   begin; \ir helpers.sql \ir matching_best_execution.sql rollback;

do $$
declare
  a uuid := kalo_test.mk_user('maker_a');
  b uuid := kalo_test.mk_user('maker_b');
  c uuid := kalo_test.mk_user('taker_c');
  m uuid;
  o_a uuid;
  o_b uuid;
  o_t uuid;
  t record;
begin
  -- give makers inventory where needed: maker A needs YES shares to sell
  perform public.grant_play_money(a, 1000, 'test_grant');
  perform public.grant_play_money(b, 1000, 'test_grant');
  perform public.grant_play_money(c, 1000, 'test_grant');

  ---------------------------------------------------------------------
  -- Scenario 1 (BUY taker, cross-path): book has SELL YES @ 0.30 and
  -- BUY NO @ 0.75 (unified ask 0.25). Incoming BUY YES @ 0.35 must fill
  -- via MINT at effective 0.25 — v2 wrongly took the 0.30 transfer.
  ---------------------------------------------------------------------
  m := kalo_test.mk_market('best-exec scenario 1');

  perform kalo_test.act_as(a);
  perform public.split_shares(m, 50);                    -- A holds 50 YES + 50 NO
  o_a := public.place_order(m, 'YES', 'SELL', 0.30, 10);

  perform kalo_test.act_as(b);
  o_b := public.place_order(m, 'NO', 'BUY', 0.75, 10);

  perform kalo_test.act_as(c);
  o_t := public.place_order(m, 'YES', 'BUY', 0.35, 5);

  select * into t from public.trades where taker_order_id = o_t;
  perform kalo_test.check(t.kind = 'mint', 's1: fills via mint, not transfer');
  perform kalo_test.check(t.price = 0.25, 's1: effective price is 0.25 (best across paths)');
  perform kalo_test.check(t.maker_order_id = o_b, 's1: maker is the complement BUY');
  perform kalo_test.check(
    (select status from public.orders where id = o_a) in ('open', 'partial')
      and (select filled_size from public.orders where id = o_a) = 0,
    's1: worse-priced direct ask untouched');

  ---------------------------------------------------------------------
  -- Scenario 2 (time tie-break across paths): unified ask 0.30 available
  -- both as SELL YES @ 0.30 (newer) and BUY NO @ 0.70 (older). The older
  -- complement order must fill first.
  ---------------------------------------------------------------------
  m := kalo_test.mk_market('best-exec scenario 2');

  perform kalo_test.act_as(b);
  o_b := public.place_order(m, 'NO', 'BUY', 0.70, 10);   -- eff ask 0.30, earlier

  perform kalo_test.act_as(a);
  perform public.split_shares(m, 50);
  o_a := public.place_order(m, 'YES', 'SELL', 0.30, 10); -- same eff, later

  -- force unambiguous ordering regardless of clock granularity
  update public.orders set created_at = now() - interval '10 seconds' where id = o_b;

  perform kalo_test.act_as(c);
  o_t := public.place_order(m, 'YES', 'BUY', 0.30, 5);

  select * into t from public.trades where taker_order_id = o_t;
  perform kalo_test.check(t.maker_order_id = o_b and t.kind = 'mint',
    's2: tie at 0.30 goes to the earlier order across candidate sets');

  ---------------------------------------------------------------------
  -- Scenario 3 (SELL taker, cross-path): book has BUY YES @ 0.40 and
  -- SELL NO @ 0.55 (unified bid 0.45). Incoming SELL YES @ 0.35 must fill
  -- via MERGE at proceeds 0.45 — v2 wrongly took the 0.40 transfer.
  ---------------------------------------------------------------------
  m := kalo_test.mk_market('best-exec scenario 3');

  perform kalo_test.act_as(a);
  o_a := public.place_order(m, 'YES', 'BUY', 0.40, 10);

  perform kalo_test.act_as(b);
  perform public.split_shares(m, 50);                    -- B holds NO to sell
  o_b := public.place_order(m, 'NO', 'SELL', 0.55, 10);

  perform kalo_test.act_as(c);
  perform public.split_shares(m, 50);                    -- C holds YES to sell
  o_t := public.place_order(m, 'YES', 'SELL', 0.35, 5);

  select * into t from public.trades where taker_order_id = o_t;
  perform kalo_test.check(t.kind = 'merge', 's3: fills via merge, not transfer');
  perform kalo_test.check(t.price = 0.45, 's3: proceeds are 0.45 (best across paths)');

  ---------------------------------------------------------------------
  -- Scenario 4 (P0-4 self-trade): taker's own better-priced ask must be
  -- skipped; the trade prints against the third party, and no wash trade
  -- reaches the tape.
  ---------------------------------------------------------------------
  m := kalo_test.mk_market('self-trade scenario 4');

  perform kalo_test.act_as(c);
  perform public.split_shares(m, 50);
  o_a := public.place_order(m, 'YES', 'SELL', 0.30, 10); -- C's own ask (better)

  perform kalo_test.act_as(a);
  perform public.split_shares(m, 50);
  o_b := public.place_order(m, 'YES', 'SELL', 0.32, 10); -- other's ask (worse)

  perform kalo_test.act_as(c);
  o_t := public.place_order(m, 'YES', 'BUY', 0.35, 5);

  select * into t from public.trades where taker_order_id = o_t;
  perform kalo_test.check(t.maker_order_id = o_b and t.price = 0.32,
    's4: own order skipped, fills the third party');
  perform kalo_test.check(
    (select filled_size from public.orders where id = o_a) = 0,
    's4: own resting order untouched (no wash print)');

  perform set_config('request.jwt.claims', '', true);
  raise notice 'matching_best_execution: ALL SCENARIOS PASSED';
end;
$$;
