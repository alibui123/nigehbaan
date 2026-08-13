import { authorize, json } from '../_shared/cron.ts'

/**
 * Fan-out to the app host (Render/Vercel) for Node-heavy ingest routes.
 * Set APP_URL + CRON_SECRET as Edge Function secrets.
 *
 * PMD GET often fails from cloud IPs; GitHub "PMD FFD ingest" (scrape→POST)
 * remains the reliable backup. Fresh-data GET failures no longer flip status red.
 */
const DEFAULT_FEED_PATHS = [
  '/api/ingest/flood-open-meteo',
  '/api/ingest/open-meteo',
  '/api/ingest/usgs',
  '/api/ingest/firms',
  '/api/ingest/pmd-snapshot',
  '/api/ingest/irsa',
  '/api/ingest/drought',
  '/api/ingest/advisories',
]

Deno.serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'method not allowed' }, 405)
  }
  if (!authorize(req)) return json({ error: 'unauthorized' }, 401)

  const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!appUrl || !cronSecret) {
    return json(
      {
        ok: false,
        error: 'Set Edge secrets APP_URL and CRON_SECRET to dispatch feed ingests',
      },
      500
    )
  }

  let paths = DEFAULT_FEED_PATHS
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      if (Array.isArray(body?.paths) && body.paths.every((p: unknown) => typeof p === 'string')) {
        paths = body.paths as string[]
      }
    } catch {
      // empty / invalid body → defaults
    }
  }

  const results: { path: string; status: number; ok: boolean; body?: string }[] = []

  for (const path of paths) {
    try {
      const res = await fetch(`${appUrl}${path}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${cronSecret}` },
      })
      const body = (await res.text()).slice(0, 300)
      results.push({ path, status: res.status, ok: res.ok, body })
    } catch (err) {
      results.push({
        path,
        status: 0,
        ok: false,
        body: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const allOk = results.every((r) => r.ok)
  return json(
    {
      ok: allOk,
      appUrl,
      results,
      via: 'supabase-edge-function',
    },
    allOk ? 200 : 207
  )
})
