-- P0-2 / P0-3 rejection suite: tick grid, minimum size, close_at enforcement.
-- Every statement here must be REJECTED by the engine.

do $$
declare
  u uuid := kalo_test.mk_user('validator');
  m uuid := kalo_test.mk_market('validation market');
  m_due uuid := kalo_test.mk_market('due market', now() - interval '1 second');
  m_closed uuid;
begin
  perform public.grant_play_money(u, 1000, 'test_grant');
  perform kalo_test.act_as(u);

  -- P0-2: tick grid — reject, never round
  perform kalo_test.expect_error(
    format('select public.place_order(%L, ''YES'', ''BUY'', 0.333, 10)', m),
    'off-grid price 0.333');
  perform kalo_test.expect_error(
    format('select public.place_order(%L, ''YES'', ''BUY'', 0.005, 10)', m),
    'sub-tick price 0.005');
  perform kalo_test.expect_error(
    format('select public.place_order(%L, ''YES'', ''BUY'', 0.00, 10)', m),
    'price 0.00');
  perform kalo_test.expect_error(
    format('select public.place_order(%L, ''YES'', ''BUY'', 1.00, 10)', m),
    'price 1.00');

  -- P0-2: size — minimum and 2dp cap
  perform kalo_test.expect_error(
    format('select public.place_order(%L, ''YES'', ''BUY'', 0.50, 0.50)', m),
    'size below min_order_size');
  perform kalo_test.expect_error(
    format('select public.place_order(%L, ''YES'', ''BUY'', 0.50, 10.123)', m),
    'size with 3 decimal places');

  -- boundary prices on the grid must be ACCEPTED
  perform public.place_order(m, 'YES', 'BUY', 0.01, 10);
  perform public.place_order(m, 'YES', 'BUY', 0.99, 1);
  raise notice 'ok: boundary prices 0.01 / 0.99 accepted';

  -- P0-3: close_at is binding even while status is still open
  perform kalo_test.expect_error(
    format('select public.place_order(%L, ''YES'', ''BUY'', 0.50, 10)', m_due),
    'order after close_at on still-open market');

  -- P0-3: the close job flips due markets and refunds escrow
  perform kalo_test.act_as(u);
  m_closed := kalo_test.mk_market('closing market', now() + interval '1 hour');
  perform public.place_order(m_closed, 'YES', 'BUY', 0.40, 10);  -- escrow 4.00
  update public.markets set close_at = now() - interval '1 second' where id = m_closed;
  perform public.close_due_markets();
  perform kalo_test.check(
    (select status from public.markets where id = m_closed) = 'closed',
    'close_due_markets flips open -> closed');
  perform kalo_test.check(
    not exists (select 1 from public.orders
                 where market_id = m_closed and status in ('open', 'partial')),
    'close flushes all resting orders');
  perform kalo_test.check(
    (select balance from public.profiles where id = u)
      = (select 2000 - 0.01*10 - 0.99*1),  -- signup 1000 + grant 1000 - live escrows
    'close refunds escrow exactly');

  -- closed markets reject orders by status
  perform kalo_test.expect_error(
    format('select public.place_order(%L, ''YES'', ''BUY'', 0.50, 10)', m_closed),
    'order on closed market');

  perform set_config('request.jwt.claims', '', true);
  raise notice 'validation: ALL CHECKS PASSED';
end;
$$;
