-- Enable realtime change events for trades. The market page subscribes to
-- postgres_changes on public.trades to refresh the chart/tape the moment a
-- fill prints; without publication membership no event is ever delivered.
-- (Trades are publicly readable under RLS, so anon subscribers receive the
-- events. Orders stay out of the publication — their RLS is own-row only,
-- and the UI covers book-only changes with a polling fallback.)

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trades'
  ) then
    alter publication supabase_realtime add table public.trades;
  end if;
end;
$$;
