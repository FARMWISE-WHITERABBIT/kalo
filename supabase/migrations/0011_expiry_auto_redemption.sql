-- M2: GTD expiry enforcement (§6.3) and auto-redemption at resolution
-- (§6.4). What changed and why:
--
-- expire_due_orders() cancels and refunds GTD orders whose expires_at has
-- passed — the same escrow refund as cancel_order, under the same per-market
-- advisory lock — and runs on the every-minute cron alongside the market
-- close job. Matching already excludes expired orders (0010), so the cron is
-- reclamation, not enforcement.
--
-- resolve_market v3 auto-redeems at resolution: winners are credited $1 per
-- winning share immediately and both sides' positions are zeroed, so users
-- no longer need to claim manually. redeem_market stays for on-chain parity
-- (§6.4) and still works if resolution happened before this migration.

create or replace function public.expire_due_orders()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_due record;
  v_order record;
  v_remaining numeric;
  v_expired int := 0;
begin
  for v_due in
    select id, market_id from public.orders
      where expires_at is not null and expires_at <= now()
        and status in ('open', 'partial')
  loop
    perform pg_advisory_xact_lock(hashtext(v_due.market_id::text));
    -- re-check under the lock; the order may have filled or been cancelled
    select * into v_order from public.orders
      where id = v_due.id and status in ('open', 'partial') for update;
    if found then
      v_remaining := v_order.size - v_order.filled_size;
      if v_order.side = 'BUY' then
        update public.profiles set balance = balance + (v_order.price * v_remaining) where id = v_order.user_id;
      else
        update public.positions set shares = shares + v_remaining
          where user_id = v_order.user_id and market_id = v_order.market_id and outcome = v_order.outcome;
      end if;
      update public.orders set status = 'cancelled' where id = v_order.id;
      v_expired := v_expired + 1;
    end if;
  end loop;
  return v_expired;
end;
$$;

-- resolve_market v3: verdict + immediate redemption
create or replace function public.resolve_market(p_market_id uuid, p_outcome text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_pos record;
begin
  if not exists (select 1 from public.profiles where id = v_user and is_admin) then
    raise exception 'admin only';
  end if;
  if p_outcome not in ('YES', 'NO') then
    raise exception 'invalid outcome';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_market_id::text));

  if not exists (select 1 from public.markets where id = p_market_id and status in ('open', 'closed')) then
    raise exception 'market not resolvable';
  end if;

  perform public.flush_market_orders(p_market_id);

  update public.markets set status = 'resolved', resolved_outcome = p_outcome where id = p_market_id;

  -- auto-redemption: winners burn shares 1:1 for balance, losing side zeroed
  for v_pos in
    select user_id, shares from public.positions
      where market_id = p_market_id and outcome = p_outcome and shares > 0
      for update
  loop
    update public.profiles set balance = balance + v_pos.shares where id = v_pos.user_id;
  end loop;
  update public.positions set shares = 0 where market_id = p_market_id;
end;
$$;

revoke execute on function public.expire_due_orders() from public, anon, authenticated;
grant execute on function public.resolve_market(uuid, text) to authenticated;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'kalo-expire-orders') then
    perform cron.schedule('kalo-expire-orders', '* * * * *', 'select public.expire_due_orders()');
  end if;
end;
$$;
