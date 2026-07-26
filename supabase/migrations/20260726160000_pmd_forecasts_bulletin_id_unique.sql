-- Upsert path in /api/ingest/pmd-snapshot requires ON CONFLICT (bulletin_id).
delete from public.pmd_forecasts a
using public.pmd_forecasts b
where a.bulletin_id = b.bulletin_id
  and a.fetched_at < b.fetched_at;

create unique index if not exists pmd_forecasts_bulletin_id_key
  on public.pmd_forecasts (bulletin_id);

drop policy if exists "pmd_forecasts_insert_service_role" on public.pmd_forecasts;
drop policy if exists "pmd_forecasts_service_role_all" on public.pmd_forecasts;
create policy "pmd_forecasts_service_role_all"
  on public.pmd_forecasts for all
  to service_role
  using (true)
  with check (true);
