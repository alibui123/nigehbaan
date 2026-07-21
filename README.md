# Nigheban — Multi-Hazard Early Warning Platform

Provincial multi-hazard monitoring and alert console for Khyber Pakhtunkhwa (KP) and Gilgit-Baltistan (GB), Pakistan. Built for Finova Solutions.

## Stack

- Next.js 16 (App Router, Turbopack)
- Supabase (Postgres + PostGIS + Auth + RLS)
- MapLibre GL JS + deck.gl
- Tailwind CSS v4

## Local setup

1. Clone the repo
2. `npm install`
3. Copy `.env.example` to `.env.local` and fill in your Supabase project values
4. `npm run dev`
5. Visit `http://localhost:3000`

## Station telemetry (M1) — HTTP-first until hardware

Field-station readings always land through one ingest path (`lib/ingest/station-telemetry.ts` → `station_reading`). Transports are swappable without changing alert triggers:

| Path | How |
|------|-----|
| **HTTP (default / Vercel)** | Simulator cron `GET /api/simulate/stations` and hardware push `POST /api/ingest/stations` |
| **MQTT (optional local/VM)** | Mosquitto + `scripts/mqtt-station-bridge.mjs` → same `POST /api/ingest/stations` |

**Why HTTP-first:** Vercel cron cannot hold a persistent MQTT client. The HTTP intake is the hardware contract (CAE/Sutron-style HTTP-push). When real GLOF-II stations come online over MQTT, run the bridge (or point devices at HTTP); the DB write path does not change.

### Optional MQTT locally

```bash
docker compose -f docker-compose.mqtt.yml up -d
npm install mqtt
npm run mqtt:bridge
# Publish JSON to: nigheban/stations/{station_id}/telemetry
```

## Branch model

`feature/* → staging → main`. See project handbook for full workflow.

## Roles

`dg`, `duty_officer`, `district_focal`, `viewer` — enforced via Postgres RLS and app workflow helpers.

| Role | Access |
|------|--------|
| `dg` | Compose CAP, approve/issue, dispatch, ack, manual readings |
| `duty_officer` | Compose CAP, submit for approval, dispatch, ack, manual readings |
| `district_focal` | Provincial map + **own district** console; view issued alerts for district; acknowledge deliveries; enter manual readings for own district. **No** compose/approve/dispatch |
| `viewer` | Read-only |

Demo login: `district_focal@nigheban.gov.pk` (assigned to Chitral Lower).
