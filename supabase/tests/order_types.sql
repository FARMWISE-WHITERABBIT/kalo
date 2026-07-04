-- M2 suite: P0-7 idempotent submission, P0-8 fee hooks at zero, GTD/FOK
-- order types, auto-redemption at resolution.

do $$
declare
  u1 uuid := kalo_test.mk_user('m2_u1');
  u2 uuid := kalo_test.mk_user('m2_u2');
  m uuid := kalo_test.mk_market('m2 market');
  k uuid := gen_random_uuid();
  o1 uuid;
  o2 uuid;
  bal numeric;
  treas numeric;
begin
  perform public.grant_play_money(u1, 1000, 'test_grant');
  perform public.grant_play_money(u2, 1000, 'test_grant');

  ---------------------------------------------------------------------
  -- P0-7: identical client_order_id returns the same order, escrows once
  ---------------------------------------------------------------------
  perform kalo_test.act_as(u1);
  select balance into bal from public.profiles where id = u1;
  o1 := public.place_order(m, 'YES', 'BUY', 0.50, 10, false, false, null, k);
  o2 := public.place_order(m, 'YES', 'BUY', 0.50, 10, false, false, null, k);
  perform kalo_test.check(o1 = o2, 'p0-7: retry returns the original order id');
  perform kalo_test.check(
    (select count(*) from public.orders where user_id = u1 and client_order_id = k) = 1,
    'p0-7: exactly one order row');
  perform kalo_test.check(
    (select balance from public.profiles where id = u1) = bal - 5.00,
    'p0-7: escrow taken exactly once');
  perform public.cancel_order(o1);

  ---------------------------------------------------------------------
  -- FOK: rejects when the book cannot fill fully, before any escrow moves
  ---------------------------------------------------------------------
  perform kalo_test.act_as(u2);
  perform public.place_order(m, 'NO', 'BUY', 0.60, 8);  -- unified ask 0.40 x 8

  perform kalo_test.act_as(u1);
  select balance into bal from public.profiles where id = u1;
  perform kalo_test.expect_error(
    format('select public.place_order(%L, ''YES'', ''BUY'', 0.45, 20, false, true)', m),
    'FOK larger than fillable quantity');
  perform kalo_test.check(
    (select balance from public.profiles where id = u1) = bal,
    'FOK reject leaves balance untouched');

  -- FOK: fills completely when the book suffices
  o1 := public.place_order(m, 'YES', 'BUY', 0.45, 8, false, true);
  perform kalo_test.check(
    (select status from public.orders where id = o1) = 'filled',
    'FOK fills all-or-nothing');

  ---------------------------------------------------------------------
  -- GTD: validation, matching exclusion, and cron reclamation
  ---------------------------------------------------------------------
  perform kalo_test.expect_error(
    format('select public.place_order(%L, ''YES'', ''BUY'', 0.50, 10, false, false, now() - interval ''1 second'')', m),
    'GTD expiry in the past');
  perform kalo_test.expect_error(
    format('select public.place_order(%L, ''YES'', ''BUY'', 0.50, 10, false, false, now() + interval ''10 days'')', m),
    'GTD expiry beyond market close');

  -- resting GTD order that then expires: excluded from matching, refunded by cron
  select balance into bal from public.profiles where id = u1;
  o1 := public.place_order(m, 'YES', 'BUY', 0.30, 10, false, false, now() + interval '1 hour');
  update public.orders set expires_at = now() - interval '1 second' where id = o1;

  perform kalo_test.act_as(u2);
  perform public.split_shares(m, 20);
  o2 := public.place_order(m, 'YES', 'SELL', 0.30, 5, true);  -- IOC into the expired bid
  perform kalo_test.check(
    (select filled_size from public.orders where id = o1) = 0
    and (select status from public.orders where id = o2) = 'cancelled',
    'GTD: expired order excluded from matching');

  perform kalo_test.check(public.expire_due_orders() >= 1, 'GTD: cron reclaims expired orders');
  perform kalo_test.check(
    (select status from public.orders where id = o1) = 'cancelled'
    and (select balance from public.profiles where id = u1) = bal,
    'GTD: expiry refunded escrow exactly');

  ---------------------------------------------------------------------
  -- P0-8: fee hooks live but rate is zero — fee recorded as 0, treasury flat
  ---------------------------------------------------------------------
  select balance into treas from public.profiles where id = public.treasury_id();
  perform kalo_test.check(
    (select count(*) from public.trades t where t.market_id = m and t.fee_amount <> 0) = 0,
    'p0-8: all fees are exactly 0 at fee_bps = 0');
  perform kalo_test.check(
    (select balance from public.profiles where id = public.treasury_id()) = treas,
    'p0-8: treasury balance unchanged at zero rate');

  ---------------------------------------------------------------------
  -- §6.4: auto-redemption at resolution
  ---------------------------------------------------------------------
  perform kalo_test.act_as(u1);
  o1 := public.place_order(m, 'YES', 'BUY', 0.70, 10);
  perform kalo_test.act_as(u2);
  perform public.place_order(m, 'NO', 'BUY', 0.30, 10);  -- mint 10 pairs

  select balance into bal from public.profiles where id = u1;
  update public.profiles set is_admin = true where id = u2;
  perform kalo_test.act_as(u2);
  perform public.resolve_market(m, 'YES');

  perform kalo_test.check(
    (select balance from public.profiles where id = u1) >= bal + 10,
    'auto-redeem: winner credited at resolution without claiming');
  perform kalo_test.check(
    not exists (select 1 from public.positions where market_id = m and shares > 0),
    'auto-redeem: all positions zeroed');

  perform set_config('request.jwt.claims', '', true);
  raise notice 'order_types: ALL CHECKS PASSED';
end;
$$;

select public.assert_invariants();
