# Project Guide

This project is Nigheban, a multi-hazard early warning platform for KP and GB. It is a Next.js app backed by Supabase, PostGIS, and role-based access rules.

## What This Project Does

The app shows a provincial hazard console with maps, alerts, stations, district views, replay mode, and audit logs. It also handles alert workflow steps like draft, approval, issue, dissemination, and acknowledgment.

The important idea is:

- `app/` decides what the user sees
- `lib/` decides how the app behaves
- `supabase/` and database files define the data model and permissions
- `scripts/` and `scratch/` contain data loading, fixes, and one-off utilities

## How The App Works

1. A user opens a page under `app/[locale]/...`.
2. That page loads data from Supabase or calls helper functions from `lib/`.
3. Business rules decide what the user can do based on role.
4. Supabase RLS and database tables protect the data.
5. Alerts, audit events, and station telemetry flow through shared helper modules so the same rules are used everywhere.

A good example is the dashboard:

- `app/[locale]/dashboard/page.tsx` loads the overview page
- `lib/alert-workflow.ts` controls role checks and alert transitions
- `lib/supabase/*` handles database clients for server, browser, and middleware code
- `lib/ingest/*` handles station telemetry and other incoming data

## Fastest Way To Find Where To Edit

If you want to change something, start by identifying which layer owns it:

- Page or layout change: search under `app/[locale]/`
- Button logic, workflow rules, or permissions: search under `lib/`
- API route behavior: search under `app/api/`
- Database or security rule problem: search under `supabase/`
- Data import or maintenance job: search under `scripts/`
- Experimental or throwaway checks: search under `scratch/`

Useful search habits:

- Search by visible text from the UI first. That usually lands on the right page file.
- Search by function name or constant if the behavior is shared by many pages.
- Search by table name if the issue is data-related.
- Search by role name such as `dg`, `duty_officer`, `district_focal`, or `viewer` when permissions are involved.

## Quick Map Of Important Files

- `app/[locale]/layout.tsx` sets the global shell, locale direction, fonts, and message provider.
- `app/[locale]/dashboard/page.tsx` builds the main provincial dashboard.
- `lib/alert-workflow.ts` contains role rules and alert status transitions.
- `lib/dissemination.ts` and `lib/dissemination-fanout.ts` handle delivery logic.
- `lib/cap-builder.ts` and `lib/cap-severity.ts` handle alert composition and severity mapping.
- `lib/audit.ts` handles audit logging.
- `lib/station-health.ts` and `lib/ingest/station-telemetry.ts` relate to station telemetry and health.
- `lib/supabase/server.ts`, `lib/supabase/client.ts`, and `lib/supabase/middleware.ts` are the main Supabase entry points.
- `app/api/` contains server endpoints and cron handlers.
- `messages/en.json` and `messages/ur.json` hold translated UI text.

## If You Want To Edit A Feature

### Change a screen
Find the page in `app/[locale]/...` and edit that page first. If the page imports a subcomponent, follow the import into the nearest component file instead of editing the page itself.

### Change alert behavior
Start in `lib/alert-workflow.ts`, then check the related alert or CAP modules in `lib/`. If the behavior reaches the database, inspect the matching table or migration in `supabase/`.

### Change station health or telemetry
Start in `lib/ingest/station-telemetry.ts` and `lib/station-health.ts`, then look for the page or component that renders the station view.

### Change login or role access
Start in `lib/alert-workflow.ts` for role logic and `lib/supabase/*` for authentication/session plumbing.

### Change an API endpoint
Search `app/api/` for the route name, then follow the helper imports into `lib/`.

## How To Trace Something Quickly

If you do not know where a feature lives, use this order:

1. Search the exact text you see in the UI.
2. Search the component or function name from the nearest import.
3. Search the table name if data is involved.
4. Search `lib/` for shared logic if many pages behave the same way.
5. Search `supabase/` if permissions, schema, or RLS are the real issue.

A few fast examples:

- Dashboard tile text usually lives in `app/[locale]/dashboard/page.tsx` or a nearby component.
- Permission failures usually come from `lib/alert-workflow.ts` or database RLS.
- Mismatched alert status logic usually comes from the workflow helpers in `lib/`.
- Missing translations usually come from `messages/en.json` and `messages/ur.json`.

## Local Commands

- `npm run dev` starts the app locally.
- `npm run lint` checks code style and obvious mistakes.
- `npm run build` checks the production build.
- `npm run mqtt:bridge` starts the optional MQTT bridge for station telemetry.

## Mental Model

Think of the project as three layers:

- Presentation: `app/` and UI components
- Rules: `lib/`
- Data and access control: Supabase tables, migrations, and RLS

If a bug looks visual, start in `app/`. If it looks logical, start in `lib/`. If it looks like a permission or persistence problem, start in Supabase.
