import { authorize, json } from '../_shared/cron.ts'

/**
 * Fan-out to the app host (Render/Vercel) for Node-heavy ingest routes.
 * Set APP_URL + CRON_SECRET as Edge Function secrets.
 * PMD scrape often fails from cloud IPs — prefer the dedicated GH/local POST path.
 */
const FEED_PATHS = [
  '/api/ingest/flood-open-meteo',
  '/api/ingest/open-meteo',
  '/api/ingest/usgs',
  '/api/ingest/firms',
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

  const results: { path: string; status: number; ok: boolean; body?: string }[] = []

  for (const path of FEED_PATHS) {
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
