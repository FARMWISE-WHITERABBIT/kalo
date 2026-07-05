-- World Cup game engine (migration 0018): fixture creation mints the full
-- binary market set with bot priors; resolve_game settles every linked
-- market from the final score through the standard resolve_market path.
-- Run after helpers.sql inside a transaction that is rolled back.

do $$
declare
  v_admin uuid := kalo_test.mk_user('wc-admin');
  v_pleb uuid := kalo_test.mk_user('wc-pleb');
  v_alice uuid := kalo_test.mk_user('wc-alice');
  v_bob uuid := kalo_test.mk_user('wc-bob');
  v_game uuid;
  v_game2 uuid;
  v_ml_home uuid;
  v_balance_before numeric;
  v_alice_before numeric;
  v_bob_before numeric;
begin
  update public.profiles set is_admin = true where id = v_admin;

  -- ── creation: market set, criteria, priors ─────────────────────────────
  perform kalo_test.act_as(v_pleb);
  perform kalo_test.expect_error(
    format($q$select public.create_game('Brazil','Norway','BRA','NOR','Round of 32',
      now() + interval '1 day', 0.54, 0.27)$q$),
    'create_game by non-admin');

  perform kalo_test.act_as(v_admin);
  perform kalo_test.expect_error(
    format($q$select public.create_game('Brazil','Norway','BRA','NOR','Round of 32',
      now() - interval '1 hour', 0.54, 0.27)$q$),
    'create_game with past kickoff');
  perform kalo_test.expect_error(
    format($q$select public.create_game('Brazil','Norway','BRA','NOR','Round of 32',
      now() + interval '1 day', 0.80, 0.30)$q$),
    'create_game with priors summing >= 1');

  v_game := public.create_game('Testland', 'Faketopia', 'TST', 'FKE', 'Round of 32',
    now() + interval '1 day', 0.54, 0.27);

  perform kalo_test.check(
    (select count(*) from public.markets where game_id = v_game) = 6,
    'fixture mints 6 binary markets');
  perform kalo_test.check(
    (select count(*) from public.markets where game_id = v_game
       and market_kind in ('moneyline_home','moneyline_away','draw','spread_home','total_over','btts')) = 6,
    'all six market kinds present');
  perform kalo_test.check(
    (select bool_and(close_at = g.kickoff_at + interval '2 hours')
       from public.markets m join public.games g on g.id = m.game_id
       where m.game_id = v_game),
    'markets close at kickoff + 2h');
  perform kalo_test.check(
    (select count(*) from public.bot_market_state s
       join public.markets m on m.id = s.market_id where m.game_id = v_game) = 6,
    'bot priors seeded for every market');
  perform kalo_test.check(
    (select target from public.bot_market_state where market_id =
       (select id from public.markets where game_id = v_game and market_kind = 'moneyline_home')) = 0.54,
    'moneyline_home prior = home prior');
  perform kalo_test.check(
    (select bool_and(description like '%FIFA%' and description like '%regulation time%')
       from public.markets where game_id = v_game),
    'resolution criteria name source and regulation-time rule');

  -- ── trade then resolve by score: 3-1 home win ──────────────────────────
  select id into v_ml_home from public.markets
    where game_id = v_game and market_kind = 'moneyline_home';

  perform kalo_test.act_as(v_alice);
  perform public.place_order(v_ml_home, 'YES', 'BUY', 0.60, 10);
  perform kalo_test.act_as(v_bob);
  perform public.place_order(v_ml_home, 'NO', 'BUY', 0.40, 10); -- mints vs alice

  select balance into v_alice_before from public.profiles where id = v_alice;
  select balance into v_bob_before from public.profiles where id = v_bob;

  perform kalo_test.act_as(v_pleb);
  perform kalo_test.expect_error(
    format('select public.resolve_game(%L, 3, 1)', v_game),
    'resolve_game by non-admin');

  perform kalo_test.act_as(v_admin);
  perform kalo_test.expect_error(
    format('select public.resolve_game(%L, -1, 0)', v_game),
    'resolve_game with negative score');

  perform public.resolve_game(v_game, 3, 1);

  perform kalo_test.check(
    (select status = 'finished' and home_score = 3 and away_score = 1
       from public.games where id = v_game),
    'game finished with recorded score');
  perform kalo_test.check(
    (select count(*) from public.markets where game_id = v_game and status <> 'resolved') = 0,
    'all six markets resolved');

  -- verdicts derived from 3-1: home win, by 2+, 4 goals, both scored
  perform kalo_test.check(
    (select resolved_outcome from public.markets where game_id = v_game and market_kind = 'moneyline_home') = 'YES'
    and (select resolved_outcome from public.markets where game_id = v_game and market_kind = 'moneyline_away') = 'NO'
    and (select resolved_outcome from public.markets where game_id = v_game and market_kind = 'draw') = 'NO'
    and (select resolved_outcome from public.markets where game_id = v_game and market_kind = 'spread_home') = 'YES'
    and (select resolved_outcome from public.markets where game_id = v_game and market_kind = 'total_over') = 'YES'
    and (select resolved_outcome from public.markets where game_id = v_game and market_kind = 'btts') = 'YES',
    '3-1 verdict set correct across all kinds');

  -- auto-redemption: alice held 10 YES → +$10; bob's NO worthless
  perform kalo_test.check(
    (select balance from public.profiles where id = v_alice) = v_alice_before + 10,
    'winner auto-redeemed $1/share');
  perform kalo_test.check(
    (select balance from public.profiles where id = v_bob) = v_bob_before,
    'loser balance unchanged');

  perform kalo_test.expect_error(
    format('select public.resolve_game(%L, 3, 1)', v_game),
    'double resolution');

  -- ── goalless draw: complement verdict set ──────────────────────────────
  v_game2 := public.create_game('Nilland', 'Zeroville', 'NIL', 'ZER', 'Round of 32',
    now() + interval '1 day', 0.40, 0.30);
  perform public.resolve_game(v_game2, 0, 0);
  perform kalo_test.check(
    (select resolved_outcome from public.markets where game_id = v_game2 and market_kind = 'draw') = 'YES'
    and (select resolved_outcome from public.markets where game_id = v_game2 and market_kind = 'moneyline_home') = 'NO'
    and (select resolved_outcome from public.markets where game_id = v_game2 and market_kind = 'moneyline_away') = 'NO'
    and (select resolved_outcome from public.markets where game_id = v_game2 and market_kind = 'spread_home') = 'NO'
    and (select resolved_outcome from public.markets where game_id = v_game2 and market_kind = 'total_over') = 'NO'
    and (select resolved_outcome from public.markets where game_id = v_game2 and market_kind = 'btts') = 'NO',
    '0-0 verdict set correct across all kinds');

  -- conservation after the full lifecycle
  perform public.assert_invariants();
  raise notice 'ok: invariants green after game lifecycle';
end;
$$;
