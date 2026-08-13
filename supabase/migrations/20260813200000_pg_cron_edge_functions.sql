-- Native Supabase crons: pg_cron + pg_net → Edge Functions.
-- Frontend already reads public.ingest_status (SourceHealthFooter / district health).

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Secrets (run once after deploy; names must match):
--   select vault.create_secret('https://YOUR_REF.supabase.co', 'project_url');
--   select vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key');
-- Optional for feed dispatch (points at Render/Vercel app):
--   select vault.create_secret('https://your-app.onrender.com', 'app_url');
--   select vault.create_secret('YOUR_CRON_SECRET', 'cron_secret');

create or replace function public.invoke_edge_function(fn_name text, payload jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  project_url text;
  service_key text;
  request_id bigint;
begin
  select decrypted_secret into project_url
  from vault.decrypted_secrets
  where name = 'project_url'
  limit 1;

  select decrypted_secret into service_key
  from vault.decrypted_secrets
  where name = 'service_role_key'
  limit 1;

  if project_url is null or service_key is null then
    raise exception 'Vault secrets project_url and service_role_key are required';
  end if;

  project_url := rtrim(project_url, '/');

  select net.http_post(
    url := project_url || '/functions/v1/' || fn_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := coalesce(payload, '{}'::jsonb),
    timeout_milliseconds := 55000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function public.invoke_edge_function(text, jsonb) from public;
grant execute on function public.invoke_edge_function(text, jsonb) to postgres;

-- Unschedule prior jobs with the same names (idempotent re-apply)
do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname in (
    'nigheban-station-sim',
    'nigheban-station-health',
    'nigheban-feed-dispatch'
  );
exception
  when undefined_table then null;
  when undefined_function then null;
end $$;

-- Station telemetry every 10 minutes → keeps station_health online + ingest_status.station_sim
select cron.schedule(
  'nigheban-station-sim',
  '*/10 * * * *',
  $$select public.invoke_edge_function('cron-station-sim');$$
);

-- Maintenance tickets every 15 minutes
select cron.schedule(
  'nigheban-station-health',
  '*/15 * * * *',
  $$select public.invoke_edge_function('cron-station-health');$$
);

-- Daily feed fan-out to APP_URL (Render/Vercel) at 01:20 UTC
select cron.schedule(
  'nigheban-feed-dispatch',
  '20 1 * * *',
  $$select public.invoke_edge_function('cron-feed-dispatch');$$
);
