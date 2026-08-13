# Cron & simulation setup (Supabase-native + optional GitHub/Render)

Station status in `station_health` is **derived from reading age**:

| Last reading | Status |
|---|---|
| missing or **> 120 min** | offline |
| 60–120 min | degraded |
| < 60 min (and battery OK) | online |
| battery **&lt; 11.0 V** | degraded |

The frontend footer (`SourceHealthFooter`) and district “Data Source Health” panels read **`ingest_status`**. Cron Edge Functions write that table after each run — no extra push channel needed.

## Primary: Supabase Edge Functions + `pg_cron`

Jobs live entirely on Supabase (project `ksdcjwpbusadklpdwfsz`):

| Job name | Schedule (UTC) | Edge Function | Effect on frontend |
|---|---|---|---|
| `nigheban-station-sim` | every 10 min | `cron-station-sim` | Writes `station_reading` + `ingest_status.station_sim=ok` → stations stay online |
| `nigheban-station-health` | every 15 min | `cron-station-health` | Opens/closes `maintenance_ticket` rows |
| `nigheban-feed-dispatch` | `20 1 * * *` | `cron-feed-dispatch` | GETs Render/Vercel `/api/ingest/*` (needs `APP_URL` + `CRON_SECRET` secrets) |

Dashboard: **Database → Cron Jobs**, or:

```sql
select jobid, jobname, schedule, active from cron.job order by jobid;
```

Manual invoke:

```sql
select public.invoke_edge_function('cron-station-sim');
select public.invoke_edge_function('cron-station-health');
select public.invoke_edge_function('cron-feed-dispatch');
```

### Vault secrets (required for `invoke_edge_function`)

| Vault name | Value |
|---|---|
| `project_url` | `https://ksdcjwpbusadklpdwfsz.supabase.co` |
| `service_role_key` | Supabase service role key |
| `app_url` | e.g. `https://nigehbaan-wyiu.onrender.com` (feed dispatch) |
| `cron_secret` | same as app `CRON_SECRET` |

### Edge Function secrets

```bash
npx supabase secrets set --project-ref ksdcjwpbusadklpdwfsz \
  CRON_SECRET=... \
  APP_URL=https://nigehbaan-wyiu.onrender.com
```

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

### Deploy / update functions

```bash
npx supabase functions deploy cron-station-sim cron-station-health cron-feed-dispatch \
  --project-ref ksdcjwpbusadklpdwfsz
```

## Backup: GitHub Actions + Render/Vercel

Still useful if Edge Functions are paused or for PMD scrape (PMD often blocks cloud IPs):

| Workflow | Schedule | Endpoint |
|---|---|---|
| Simulate Station Telemetry | ~every 10–60 min | `/api/simulate/stations` |
| Station Health Sweep | ~every 15 min | `/api/cron/station-health` |
| PMD FFD ingest | 00:40 & 12:40 UTC | scrape → `POST /api/ingest/pmd-snapshot` |
| Ingest feeds | 01:15 UTC | all `/api/ingest/*` |

Set GitHub secrets `CRON_SECRET` + `APP_URL` to your Render URL.

### PMD note

Prefer GitHub **PMD FFD ingest** or local:

```powershell
node scripts/pmd-ingest-local.mjs https://nigehbaan-wyiu.onrender.com
```

Cloud GET of `ffd.pmd.gov.pk` often returns 403; successful POSTs still keep `pmd_ffd` green when data is fresh.
