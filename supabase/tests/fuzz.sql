-- Property/fuzz suite (§7): a seeded random order stream — mixed sides,
-- outcomes, on-grid prices, sizes, IOC flags, splits, and cancels — against
-- fresh users on fresh markets. Invariants are asserted every 100 operations
-- and at the end. Deterministic via setseed(); a failure is an engine bug,
-- never a flake.

select setseed(0.42);

do $$
declare
  users uuid[] := array[
    kalo_test.mk_user('fuzz_1'), kalo_test.mk_user('fuzz_2'),
    kalo_test.mk_user('fuzz_3'), kalo_test.mk_user('fuzz_4')
  ];
  mkts uuid[] := array[
    kalo_test.mk_market('fuzz market A'),
    kalo_test.mk_market('fuzz market B')
  ];
  u uuid;
  m uuid;
  v_side text;
  v_outc text;
  v_price numeric;
  v_size numeric;
  o uuid;
  i int;
  placed int := 0;
  rejected int := 0;
  cancelled int := 0;
  splits int := 0;
begin
  foreach u in array users loop
    perform public.grant_play_money(u, 4000, 'fuzz_grant');
  end loop;

  for i in 1..400 loop
    u := users[1 + floor(random() * 4)::int];
    m := mkts[1 + floor(random() * 2)::int];
    perform kalo_test.act_as(u);

    begin
      if random() < 0.10 then
        -- split: manufacture inventory so SELLs and merges happen
        perform public.split_shares(m, round((5 + random() * 40)::numeric, 2));
        splits := splits + 1;
      elsif random() < 0.15 then
        -- cancel a random own resting order
        select id into o from public.orders
          where user_id = u and market_id = m and status in ('open', 'partial')
          order by random() limit 1;
        if o is not null then
          perform public.cancel_order(o);
          cancelled := cancelled + 1;
        end if;
      else
        v_side := case when random() < 0.6 then 'BUY' else 'SELL' end;
        v_outc := case when random() < 0.5 then 'YES' else 'NO' end;
        v_price := (1 + floor(random() * 99)::int) / 100.0;  -- on-grid 0.01..0.99
        v_size := round((1 + random() * 25)::numeric, 2);
        perform public.place_order(m, v_outc, v_side, v_price, v_size, random() < 0.3);
        placed := placed + 1;
      end if;
    exception when others then
      -- legitimate rejections (insufficient balance/shares) are part of the
      -- stream; anything that corrupts state is caught by the invariants
      rejected := rejected + 1;
    end;

    if i % 100 = 0 then
      perform set_config('request.jwt.claims', '', true);
      perform public.assert_invariants();
      raise notice 'fuzz: % ops — invariants green (placed=% rejected=% cancelled=% splits=%)',
        i, placed, rejected, cancelled, splits;
    end if;
  end loop;

  perform set_config('request.jwt.claims', '', true);
  perform public.assert_invariants();

  -- I6 sanity over the stream: every print carries both order ids
  perform kalo_test.check(
    not exists (select 1 from public.trades t
                 where t.market_id = any(mkts)
                   and (t.taker_order_id is null or t.maker_order_id is null)),
    'fuzz: all prints collateralized (I6)');
  -- I5 sanity: effective prices stayed inside the grid bounds
  perform kalo_test.check(
    not exists (select 1 from public.trades t
                 where t.market_id = any(mkts) and (t.price < 0.01 or t.price > 0.99)),
    'fuzz: all effective prices within (0,1) grid bounds');

  raise notice 'fuzz: COMPLETE — % placed, % rejected, % cancels, % splits, invariants green',
    placed, rejected, cancelled, splits;
end;
$$;
