-- M1: P0-3 (close_at enforcement / lifecycle automation) and the
-- resolve_market half of P0-6. What changed and why:
--
-- P0-3  Markets now transition open -> closed automatically at close_at via a
--       pg_cron job (every minute). Closing cancels and refunds every resting
--       order exactly the way resolve_market did, so no escrow is stranded.
--       Resolution stays a separate admin verdict on a closed (or still-open)
--       market. place_order already rejects at close_at since 0006, so the
--       cron is belt-and-braces, not the enforcement itself.
--
-- P0-6  resolve_market and the close job take pg_advisory_xact_lock on the
--       market, closing the resolve/place race where an in-flight order could
--       rest after the cancel loop and strand its escrow.
--
-- Lifecycle after this migration: open -> closed (cron or admin resolve)
-- -> resolved (admin) -> redemption. 'closed' was already in the status CHECK
-- constraint since 0001; it is now actually reachable.

-- shared internal helper: cancel + refund every resting order of a market.
-- Caller must already hold the market's advisory lock.
create or replace function public.flush_market_orders(p_market_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_remaining numeric;
begin
  for v_order in
    select * from public.orders
      where market_id = p_market_id and status in ('open', 'partial')
      for update
  loop
    v_remaining := v_order.size - v_order.filled_size;
    if v_order.side = 'BUY' then
      update public.profiles set balance = balance + (v_order.price * v_remaining) where id = v_order.user_id;
    else
      update public.positions set shares = shares + v_remaining
        where user_id = v_order.user_id and market_id = v_order.market_id and outcome = v_order.outcome;
    end if;
    update public.orders set status = 'cancelled' where id = v_order.id;
  end loop;
end;
$$;

-- cron entrypoint: flip due markets to closed
create or replace function public.close_due_markets()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market record;
  v_closed int := 0;
begin
  for v_market in
    select id from public.markets
      where status = 'open' and close_at is not null and close_at <= now()
  loop
    perform pg_advisory_xact_lock(hashtext(v_market.id::text));
    -- re-check under the lock: an admin may have resolved it meanwhile
    if exists (select 1 from public.markets where id = v_market.id and status = 'open') then
      perform public.flush_market_orders(v_market.id);
      update public.markets set status = 'closed' where id = v_market.id;
      v_closed := v_closed + 1;
    end if;
  end loop;
  return v_closed;
end;
$$;

-- resolve_market v2: advisory lock; resolvable from open OR closed
create or replace function public.resolve_market(p_market_id uuid, p_outcome text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
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

  -- no-op for markets already flushed at close; flushes resting orders when
  -- resolving an open market directly
  perform public.flush_market_orders(p_market_id);

  update public.markets set status = 'resolved', resolved_outcome = p_outcome where id = p_market_id;
end;
$$;

revoke execute on function public.flush_market_orders(uuid) from public, anon, authenticated;
revoke execute on function public.close_due_markets() from public, anon, authenticated;
grant execute on function public.resolve_market(uuid, text) to authenticated;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'kalo-close-markets') then
    perform cron.schedule('kalo-close-markets', '* * * * *', 'select public.close_due_markets()');
  end if;
end;
$$;
