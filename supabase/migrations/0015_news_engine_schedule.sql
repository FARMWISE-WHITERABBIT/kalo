-- Schedules the news-engine Edge Function every 5 minutes via pg_cron +
-- pg_net. The Authorization header carries the project's anon key — a
-- public, client-side key by design (the function's real privileges come
-- from its own service-role env, and verify_jwt merely requires a valid
-- platform JWT to invoke it). Note: URL and key are environment-specific;
-- when replaying against another environment, substitute its values.

create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'kalo-news-engine') then
    perform cron.schedule(
      'kalo-news-engine',
      '*/5 * * * *',
      $cmd$
      select net.http_post(
        url := 'https://wzdyeptiyxplfdhfvcrd.supabase.co/functions/v1/news-engine',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6ZHllcHRpeXhwbGZkaGZ2Y3JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMTY1MzgsImV4cCI6MjA5ODY5MjUzOH0.xFXGzdypw9sS2sQbFyTtkF4eZzUdZNOlcZgp7GjXW1k'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 40000
      );
      $cmd$
    );
  end if;
end;
$$;
