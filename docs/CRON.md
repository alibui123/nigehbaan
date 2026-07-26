# Cron & simulation setup (Vercel + GitHub Actions)

Station status in `station_health` is **derived from reading age**:

| Last reading | Status |
|---|---|
| missing or **> 30 min** | offline |
| 15–30 min | degraded |
| < 15 min | online |

So `/api/simulate/stations` must keep writing telemetry. On **Vercel Hobby**, frequent crons are limited — use **GitHub Actions** as the primary sub-hourly scheduler.

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

`ffd.pmd.gov.pk` blocks Vercel and GitHub Actions IPs (HTTP 403). When Actions fail:

```bash
# from a normal network (laptop), with Vercel CRON_SECRET:
CRON_SECRET=your_vercel_secret node scripts/pmd-ingest-local.mjs https://nigehbaan1.vercel.app
```

That scrapes the bulletin PDF locally, extracts text, and POSTs to production so the PMD FFD pill stays green.

Use **Run workflow** on Simulate Station Telemetry to verify stations after the first Vercel deploy.

## 4. Vercel cron (`vercel.json`) — Hobby compatible

**Vercel Hobby only allows each cron to run once per day.**  
So `vercel.json` uses daily schedules only (backup).

| Need | Who runs it |
|---|---|
| Stations every ~10 min | **GitHub Actions** → Simulate Station Telemetry |
| Station health tickets | **GitHub Actions** → Station Health Sweep |
| PMD twice daily | **Local script** `scripts/pmd-ingest-local.mjs` (PMD blocks cloud IPs); GH Actions tries cloudscraper as backup |
| Daily feed ingest | Vercel cron **or** GitHub → Ingest feeds |

PMD is **not** in `vercel.json` — Vercel cannot fetch the bulletin.

Do **not** put `*/10`, `0 * * * *`, or `0,12` in `vercel.json` on Hobby — Vercel will reject the deploy.
