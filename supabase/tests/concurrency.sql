-- P0-6 concurrency suite: N parallel sessions hammering one market, then
-- invariants must hold. True parallelism needs extra connections; this file
-- uses dblink async queries when available and SKIPs (with a notice) when
-- not. Two additional layers of concurrency evidence exist regardless:
--   * the HFT bot engine trades continuously via pooled PostgREST + cron
--     worker connections against live traffic, and
--   * record_invariants() runs on pg_cron every 10 minutes against that load.

do $$
declare
  conninfo text := 'dbname=' || current_database();
  u1 uuid;
  u2 uuid;
  u3 uuid;
  m uuid;
  i int;
  busy int;
begin
  begin
    create extension if not exists dblink;
  exception when others then
    raise notice 'SKIP concurrency (dblink unavailable): %', sqlerrm;
    return;
  end;

  u1 := kalo_test.mk_user('conc_1');
  u2 := kalo_test.mk_user('conc_2');
  u3 := kalo_test.mk_user('conc_3');
  m := kalo_test.mk_market('concurrency market');
  perform public.grant_play_money(u1, 50000, 'test_grant');
  perform public.grant_play_money(u2, 50000, 'test_grant');
  perform public.grant_play_money(u3, 50000, 'test_grant');

  begin
    perform dblink_connect('c1', conninfo);
    perform dblink_connect('c2', conninfo);
    perform dblink_connect('c3', conninfo);
  exception when others then
    raise notice 'SKIP concurrency (dblink cannot connect: %)', sqlerrm;
    return;
  end;

  -- three sessions place interleaved crossing orders concurrently
  for i in 1..20 loop
    perform dblink_send_query('c1', format(
      $q$select set_config('request.jwt.claims', '{"sub":"%s","role":"authenticated"}', true),
         public.place_order('%s','YES','BUY', %s, 10)$q$,
      u1, m, 0.40 + (i %% 10) * 0.01));
    perform dblink_send_query('c2', format(
      $q$select set_config('request.jwt.claims', '{"sub":"%s","role":"authenticated"}', true),
         public.place_order('%s','NO','BUY', %s, 10)$q$,
      u2, m, 0.60 - (i %% 10) * 0.01));
    perform dblink_send_query('c3', format(
      $q$select set_config('request.jwt.claims', '{"sub":"%s","role":"authenticated"}', true),
         public.place_order('%s','YES','BUY', %s, 5, true)$q$,
      u3, m, 0.55));

    -- drain all three before the next round
    loop
      busy := dblink_is_busy('c1') + dblink_is_busy('c2') + dblink_is_busy('c3');
      exit when busy = 0;
      perform pg_sleep(0.01);
    end loop;
    perform dblink_get_result('c1');
    perform dblink_get_result('c2');
    perform dblink_get_result('c3');
  end loop;

  perform dblink_disconnect('c1');
  perform dblink_disconnect('c2');
  perform dblink_disconnect('c3');

  -- NOTE: the three sessions committed real work (dblink connections are
  -- independent transactions), so this file must run against a disposable
  -- database (supabase test db), not wrapped-and-rolled-back like the others.
  perform public.assert_invariants();
  raise notice 'concurrency: 60 parallel orders settled, invariants green';
end;
$$;
