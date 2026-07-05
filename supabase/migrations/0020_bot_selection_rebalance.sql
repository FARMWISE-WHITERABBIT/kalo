-- bot_burst v5: sub-linear (sqrt) volume weighting in market selection.
--
-- What changed and why: v4 added cold-start/kickoff boosts, but measured
-- live, top markets carry ~$40k of 24h volume, so the linear vol24 term
-- still outweighed a +150 boost ~50:1 and new listings were sampled too
-- rarely (observed: 3 of 72 World Cup books quoted after several minutes).
-- Volume now enters as sqrt(vol24): trending markets keep their edge
-- (sqrt(40k) ~ 200) but the boosts (+150 new listing, +400 kickoff window)
-- are decisive for cold books, so every new market gets quoted within
-- minutes while flow still concentrates where the action is. Only the
-- weight expression changed from v4 (0019); everything else is identical.

create or replace function public.bot_burst(p_rounds int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg record;
  v_bot record;
  v_market record;
  v_state record;
  v_order record;
  v_target numeric;
  v_half numeric;
  v_bid numeric;
  v_ask numeric;
  v_maker uuid;
  v_taker record;
  v_level int;
  v_takes int;
  v_size numeric;
  v_shares numeric;
  v_up_bias numeric;
  v_bias numeric;
  v_prints int := 0;
begin
  select * into v_cfg from public.bot_config where id = 1;
  if v_cfg is null or not exists (select 1 from public.bot_traders) then
    return 0;
  end if;

  -- faucet: keep fleet bots near their $10k bankroll (ledgered, I1)
  for v_bot in
    select p.id, p.balance from public.profiles p
    join public.bot_traders b on b.user_id = p.id
    where p.balance < 2000
  loop
    perform public.grant_play_money(v_bot.id, 10000 - v_bot.balance, 'bot_faucet');
  end loop;

  insert into public.bot_market_state (market_id, target)
  select m.id,
         coalesce(
           (select case when t.outcome = 'YES' then t.price else 1 - t.price end
              from public.trades t where t.market_id = m.id
              order by t.created_at desc limit 1),
           0.30 + random() * 0.40)
  from public.markets m
  where m.status = 'open'
  on conflict (market_id) do nothing;

  for v_market in
    select w.market_id, w.category
    from (
      select s.market_id, m.category,
             greatest(0.5, s.heat) * (
               1 + sqrt(coalesce(v.vol24, 0))
                 -- cold start: new listings get sampled before they have volume
                 + case when m.created_at > now() - interval '48 hours' then 150 else 0 end
                 -- game flow concentrates into kickoff and through the match
                 + case when g.kickoff_at between now() - interval '2 hours'
                                             and now() + interval '24 hours'
                        then 400 else 0 end
             ) as w
      from public.bot_market_state s
      join public.markets m on m.id = s.market_id and m.status = 'open'
      left join public.games g on g.id = m.game_id
      left join (
        select market_id, sum(price * size) as vol24
        from public.trades
        where created_at > now() - interval '24 hours' and not is_seed
        group by market_id
      ) v on v.market_id = s.market_id
    ) w
    order by power(random(), 1.0 / w.w) desc
    limit p_rounds
  loop
    select * into v_state from public.bot_market_state where market_id = v_market.market_id for update;

    -- residual random shocks at 0.5%: news_apply_impact is the shock source now
    if v_state.shock_until is null or v_state.shock_until < now() then
      if random() < 0.005 * v_cfg.aggression then
        v_state.momentum := (case when random() < 0.5 then 1 else -1 end) * (0.01 + random() * 0.03);
        v_state.heat := least(20, v_state.heat + 4 + random() * 6);
        v_state.shock_until := now() + ((2 + random() * 10) * interval '1 minute');
      end if;
    end if;

    v_target := greatest(0.03, least(0.97,
      v_state.target
      + v_state.momentum
      + (random() - 0.5) * 0.012 * (1 + least(v_state.heat, 8) * 0.15)));
    v_state.momentum := v_state.momentum * 0.88;
    v_state.heat := greatest(1, v_state.heat * 0.96);

    update public.bot_market_state
      set target = v_target, momentum = v_state.momentum, heat = v_state.heat,
          shock_until = v_state.shock_until, updated_at = now()
      where market_id = v_market.market_id;

    for v_order in
      select o.id, o.user_id from public.orders o
      join public.bot_traders b on b.user_id = o.user_id
      where o.market_id = v_market.market_id and o.status in ('open', 'partial')
        and o.created_at < now() - interval '3 minutes'
    loop
      perform public.bot_impersonate(v_order.user_id);
      perform public.cancel_order(v_order.id);
    end loop;

    -- makers: interested bots quote (activity-weighted); fall back to anyone
    v_half := 0.01 + random() * 0.02;
    for v_level in 0..1 loop
      v_bid := round(greatest(0.02, least(0.96, v_target - v_half - v_level * 0.01))::numeric, 2);
      v_ask := round(greatest(v_bid + 0.02, least(0.98, v_target + v_half + v_level * 0.01))::numeric, 2);

      select user_id into v_maker from public.bot_traders
        where v_market.category is null or interests = '{}' or v_market.category = any(interests)
        order by power(random(), 1.0 / activity) desc limit 1;
      if v_maker is null then
        select user_id into v_maker from public.bot_traders order by random() limit 1;
      end if;
      perform public.bot_impersonate(v_maker);
      perform public.place_order(v_market.market_id, 'YES', 'BUY', v_bid,
        round((exp(3.2 + random() * 2.0) * (1 + v_level))::numeric, 2));

      select user_id into v_maker from public.bot_traders
        where v_market.category is null or interests = '{}' or v_market.category = any(interests)
        order by power(random(), 1.0 / activity) desc limit 1;
      perform public.bot_impersonate(v_maker);
      perform public.place_order(v_market.market_id, 'NO', 'BUY', round(1 - v_ask, 2),
        round((exp(3.2 + random() * 2.0) * (1 + v_level))::numeric, 2));
    end loop;

    -- takers: interested bots cross; hotter market -> more of them
    v_takes := floor(random() * (1 + least(v_state.heat, 6) * 0.5 * v_cfg.aggression))::int;
    v_up_bias := 0.5 + greatest(-0.3, least(0.3, v_state.momentum * 12));

    for v_level in 1..v_takes loop
      select user_id, risk, contrarian into v_taker from public.bot_traders
        where v_market.category is null or interests = '{}' or v_market.category = any(interests)
        order by power(random(), 1.0 / activity) desc limit 1;
      exit when v_taker is null;
      perform public.bot_impersonate(v_taker.user_id);

      -- contrarians fade the trend instead of chasing it
      v_bias := case when random() < v_taker.contrarian
                  then 1 - v_up_bias else v_up_bias end;
      -- risk appetite scales position size
      v_size := round((exp(2.6 + random() * 2.2) * (0.4 + v_taker.risk))::numeric, 2);
      if v_size < 1 then v_size := 1.00; end if;

      if random() < v_bias then
        perform public.place_order(v_market.market_id, 'YES', 'BUY',
          least(0.98, round(v_target + v_half + 0.03, 2)), v_size, true);
      else
        select coalesce(shares, 0) into v_shares from public.positions
          where user_id = v_taker.user_id and market_id = v_market.market_id and outcome = 'YES';
        if coalesce(v_shares, 0) > 25 and random() < 0.5 then
          perform public.place_order(v_market.market_id, 'YES', 'SELL',
            greatest(0.02, round(v_target - v_half - 0.03, 2)), least(v_shares, v_size), true);
        else
          perform public.place_order(v_market.market_id, 'NO', 'BUY',
            least(0.98, round(1 - v_target + v_half + 0.03, 2)), v_size, true);
        end if;
      end if;
      v_prints := v_prints + 1;
    end loop;
  end loop;

  perform set_config('request.jwt.claims', '', true);
  return v_prints;
end;
$$;
