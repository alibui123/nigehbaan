-- Add dedicated twice-daily PMD snapshot dispatch (matches Vercel 40 0 * * * + GH backup).
-- Full feed batch already includes pmd-snapshot; this job retries PMD alone at 00:40 & 12:40 UTC.

do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'nigheban-pmd-snapshot';
exception
  when undefined_table then null;
  when undefined_function then null;
end $$;

select cron.schedule(
  'nigheban-pmd-snapshot',
  '40 0,12 * * *',
  $$select public.invoke_edge_function(
    'cron-feed-dispatch',
    '{"paths":["/api/ingest/pmd-snapshot"]}'::jsonb
  );$$
);
