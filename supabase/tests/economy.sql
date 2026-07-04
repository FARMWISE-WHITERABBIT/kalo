-- M3 (items 1-2) suite: daily faucet economy and the PnL leaderboard.

do $$
declare
  u1 uuid := kalo_test.mk_user('econ_u1');
  u2 uuid := kalo_test.mk_user('econ_u2');
  m uuid := kalo_test.mk_market('econ market');
  r jsonb;
  bal numeric;
  pnl1 numeric;
  pnl2 numeric;
begin
  -- faucet: first claim = 100, streak 1, ledgered through grant_play_money
  perform kalo_test.act_as(u1);
  select balance into bal from public.profiles where id = u1;
  r := public.claim_faucet();
  perform kalo_test.check((r->>'amount')::numeric = 100 and (r->>'streak')::int = 1,
    'faucet: first claim 100 @ streak 1');
  perform kalo_test.check((select balance from public.profiles where id = u1) = bal + 100,
    'faucet: balance credited');
  perform kalo_test.check(
    (select count(*) from public.mint_ledger where user_id = u1 and reason = 'faucet_claim') = 1,
    'faucet: mint ledgered (I1)');

  -- immediate reclaim rejected
  perform kalo_test.expect_error('select public.claim_faucet()', 'faucet: same-day reclaim');

  -- next-day claim continues the streak with a bigger amount
  update public.faucet_claims set claimed_at = now() - interval '24 hours' where user_id = u1;
  r := public.claim_faucet();
  perform kalo_test.check((r->>'amount')::numeric = 125 and (r->>'streak')::int = 2,
    'faucet: streak 2 pays 125');

  -- a lapsed streak resets
  update public.faucet_claims set claimed_at = claimed_at - interval '3 days' where user_id = u1;
  r := public.claim_faucet();
  perform kalo_test.check((r->>'streak')::int = 1, 'faucet: 3-day gap resets streak');

  -- leaderboard: fresh user PnL is exactly 0; trading is zero-sum at 0 bps
  perform kalo_test.check(
    (select l.pnl from public.leaderboard(100) l where l.display_name = 'econ_u2') = 0,
    'leaderboard: fresh user PnL = 0');

  perform kalo_test.act_as(u1);
  perform public.place_order(m, 'YES', 'BUY', 0.60, 50);
  perform kalo_test.act_as(u2);
  perform public.place_order(m, 'NO', 'BUY', 0.40, 50);  -- mint 50 pairs, marks at 0.40

  select l.pnl into pnl1 from public.leaderboard(100) l where l.display_name = 'econ_u1';
  select l.pnl into pnl2 from public.leaderboard(100) l where l.display_name = 'econ_u2';
  perform kalo_test.check(pnl1 + pnl2 = 0, 'leaderboard: mark-to-mid PnL is zero-sum at 0 bps');

  -- status endpoint returns coherent aggregates
  r := public.system_status();
  perform kalo_test.check((r->>'markets_open')::int >= 1 and (r->'invariants'->>'ok')::boolean,
    'status: aggregates + invariants ok');

  perform set_config('request.jwt.claims', '', true);
  raise notice 'economy: ALL CHECKS PASSED';
end;
$$;
