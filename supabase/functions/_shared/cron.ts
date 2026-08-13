import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Allow service role JWT or CRON_SECRET bearer (for manual/external triggers). */
export function authorize(req: Request): boolean {
  const auth = req.headers.get('Authorization') ?? ''
  const cronSecret = Deno.env.get('CRON_SECRET')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (serviceKey && auth === `Bearer ${serviceKey}`) return true
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true
  return false
}

export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function writeIngestStatus(
  supabase: SupabaseClient,
  source: string,
  status: 'ok' | 'degraded' | 'failed' | 'unknown',
  error?: string
) {
  const row: Record<string, unknown> = { source, status }
  if (status === 'ok') {
    row.last_success_at = new Date().toISOString()
    row.last_error = null
    row.last_error_at = null
  } else {
    row.last_error = error ?? 'Unknown error'
    row.last_error_at = new Date().toISOString()
  }
  const { error: upsertError } = await supabase.from('ingest_status').upsert(row, { onConflict: 'source' })
  if (upsertError) console.error(`[ingest:${source}] status write failed:`, upsertError.message)
}
