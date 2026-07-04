-- Invariant suite (§4): asserts the live conservation laws via
-- assert_invariants(), then exercises I4 (escrow completeness) through a
-- full market lifecycle: grant -> trade (mint) -> rest orders -> cancel ->
-- close (flush+refund) -> resolve -> redeem, ending with exact conservation.

-- I1/I2/I3/I6 on current database state
select public.assert_invariants();

do $$
declare
  u1 uuid := kalo_test.mk_user('lifecycle_u1');
  u2 uuid := kalo_test.mk_user('lifecycle_u2');
  m uuid := kalo_test.mk_market('lifecycle market', now() + interval '1 hour');
  o uuid;
begin
  -- signup grants (via trigger + ledger): 1000 each — the only money in play

  -- trade: u1 rests BUY YES @0.60 x50, u2 crosses with BUY NO @0.40 x50 (mint)
  perform kalo_test.act_as(u1);
  o := public.place_order(m, 'YES', 'BUY', 0.60, 50);
  perform kalo_test.act_as(u2);
  perform public.place_order(m, 'NO', 'BUY', 0.40, 50);

  perform kalo_test.check(
    (select count(*) from public.trades t
      where t.market_id = m and t.kind = 'mint' and t.size = 50) = 1,
    'i4: mint cross printed');
  perform kalo_test.check(
    (select shares from public.positions where user_id = u1 and market_id = m and outcome = 'YES') = 50
    and (select shares from public.positions where user_id = u2 and market_id = m and outcome = 'NO') = 50,
    'i4: pair fully collateralized (50 YES / 50 NO)');

  -- rest and cancel a SELL (share escrow round-trips exactly)
  perform kalo_test.act_as(u1);
  o := public.place_order(m, 'YES', 'SELL', 0.70, 20);
  perform kalo_test.check(
    (select shares from public.positions where user_id = u1 and market_id = m and outcome = 'YES') = 30,
    'i4: SELL escrowed 20 shares');
  perform public.cancel_order(o);
  perform kalo_test.check(
    (select shares from public.positions where user_id = u1 and market_id = m and outcome = 'YES') = 50,
    'i4: cancel refunded shares exactly');

  -- rest a BUY, then close the market: flush must refund the cash escrow
  o := public.place_order(m, 'YES', 'BUY', 0.55, 10);
  update public.markets set close_at = now() - interval '1 second' where id = m;
  perform public.close_due_markets();
  perform kalo_test.check(
    (select status from public.markets where id = m) = 'closed'
    and (select status from public.orders where id = o) = 'cancelled',
    'i4: close flushed the resting BUY');

  -- resolve YES (admin): auto-redemption pays winners at resolution (0011),
  -- and the parity redeem path settles any holder idempotently (0013)
  update public.profiles set is_admin = true where id = u1;
  perform kalo_test.act_as(u1);
  perform public.resolve_market(m, 'YES');
  perform public.redeem_market(m);  -- already auto-redeemed: no-op, no raise
  perform kalo_test.act_as(u2);
  perform public.redeem_market(m);  -- loser-only holder: no-op, no raise
  perform kalo_test.check(
    (select balance from public.profiles where id = u2) = 980,
    'i4: loser parity redeem is a no-op on balance');

  -- exact conservation for the pair: u1 = 1000 - 0.60*50 + 50 = 1020,
  -- u2 = 1000 - 0.40*50 = 980; sum = exactly what was minted for them
  perform kalo_test.check(
    (select balance from public.profiles where id = u1) = 1020
    and (select balance from public.profiles where id = u2) = 980,
    'i4: final balances exact (1020 / 980)');
  perform kalo_test.check(
    (select sum(balance) from public.profiles where id in (u1, u2))
      = (select sum(amount) from public.mint_ledger where user_id in (u1, u2)),
    'i4: sum(balances) = total minted for the cohort');

  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- the lifecycle must leave every global invariant green
select public.assert_invariants();
