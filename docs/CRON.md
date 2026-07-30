# Cron & simulation setup (Vercel + GitHub Actions)

Station status in `station_health` is **derived from reading age**:

| Last reading | Status |
|---|---|
| missing or **> 120 min** | offline |
| 60–120 min | degraded |
| < 60 min (and battery OK) | online |
| battery **&lt; 11.0 V** | degraded |

So `/api/simulate/stations` must keep writing telemetry. On **Vercel Hobby**, frequent crons are limited — use **GitHub Actions** as the primary scheduler (note: GH `*/10` crons are often delayed to ~hourly).

## 1. Vercel project

1. Import [alibui123/nigehbaan](https://github.com/alibui123/nigehbaan).
2. Set env vars (same as local `.env.local`), including:
   - `CRON_SECRET` — required; Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`
   - Supabase, map style, `FIRMS_MAP_KEY`, etc.
3. Deploy and copy the deployment URL (e.g. `https://nigehbaan.vercel.app`).

## 2. GitHub repo secrets

Settings → Secrets and variables → Actions:

| Secret | Example |
|---|---|
| `CRON_SECRET` | same value as Vercel `CRON_SECRET` |
| `APP_URL` | `https://your-deployment.vercel.app` (no trailing slash) |

## 3. Workflows (Actions tab)

| Workflow | Schedule | Endpoint |
|---|---|---|
| **Simulate Station Telemetry** | every 10 min | `/api/simulate/stations` |
| **Station Health Sweep** | every 15 min | `/api/cron/station-health` |
| **PMD FFD ingest** | 00:40 & 12:40 UTC | scrape + POST `/api/ingest/pmd-snapshot` |
| **Ingest feeds (daily)** | 01:15 UTC | all `/api/ingest/*` |

### PMD FFD note

Both **Vercel cron** and **GitHub Actions** call PMD ingest:

| Caller | How | Schedule |
|---|---|---|
| Vercel | `GET /api/ingest/pmd-snapshot` (`vercel.json`) | once daily `40 0 * * *` UTC (Hobby limit) |
| GitHub **PMD FFD ingest** | scrape off-Vercel → `POST` PDF text | 00:40 & 12:40 UTC |
| GitHub **Ingest feeds** | `GET /api/ingest/pmd-snapshot` (backup) | 01:15 UTC |

`ffd.pmd.gov.pk` often blocks cloud IPs (HTTP 403). When cloud runs fail, scrape from a normal network:

```powershell
node scripts/pmd-ingest-local.mjs https://nigehbaan1.vercel.app
```

(Uses `CRON_SECRET` from `.env.local`.)

Use **Run workflow** on Simulate Station Telemetry to verify stations after the first Vercel deploy.

## 4. Vercel cron (`vercel.json`) — Hobby compatible

**Vercel Hobby only allows each cron to run once per day.**  
So `vercel.json` uses daily schedules only (GitHub Actions is the frequent scheduler).

| Need | Who runs it |
|---|---|
| Stations every ~10 min | **GitHub Actions** → Simulate Station Telemetry |
| Station health tickets | **GitHub Actions** → Station Health Sweep |
| PMD | **Vercel cron** (daily GET) + **GitHub PMD FFD ingest** (scrape+POST, twice daily) + local script fallback |
| Daily feed ingest | Vercel cron **or** GitHub → Ingest feeds |

Do **not** put `*/10` or hourly crons in `vercel.json` on Hobby — Vercel will reject the deploy.
