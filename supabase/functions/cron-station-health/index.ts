import { adminClient, authorize, json } from '../_shared/cron.ts'

const OFFLINE_TICKET_THRESHOLD_HOURS = 24

Deno.serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'method not allowed' }, 405)
  }
  if (!authorize(req)) return json({ error: 'unauthorized' }, 401)

  const supabase = adminClient()

  try {
    const { data: health, error: healthError } = await supabase
      .from('station_health')
      .select('station_id, last_transmission_at, status')

    if (healthError || !health) {
      throw new Error(healthError?.message ?? 'failed to load station_health')
    }

    const now = Date.now()
    const staleStations = health.filter((s) => {
      if (!s.last_transmission_at) return true
      const ageHours = (now - new Date(s.last_transmission_at).getTime()) / (1000 * 60 * 60)
      return ageHours > OFFLINE_TICKET_THRESHOLD_HOURS
    })

    const { data: openTickets } = await supabase
      .from('maintenance_ticket')
      .select('station_id')
      .eq('status', 'open')

    const openStationIds = new Set((openTickets ?? []).map((t) => t.station_id))

    const toCreate = staleStations
      .filter((s) => !openStationIds.has(s.station_id))
      .map((s) => ({
        station_id: s.station_id,
        reason: `Station offline for more than ${OFFLINE_TICKET_THRESHOLD_HOURS} hours (no telemetry received)`,
        status: 'open',
      }))

    let created = 0
    if (toCreate.length > 0) {
      const { error: insertError } = await supabase.from('maintenance_ticket').insert(toCreate)
      if (insertError) throw new Error(insertError.message)
      created = toCreate.length
    }

    const recoveredStationIds = health
      .filter((s) => s.status !== 'offline' && openStationIds.has(s.station_id))
      .map((s) => s.station_id)

    let resolved = 0
    if (recoveredStationIds.length > 0) {
      const { data: resolvedRows, error: resolveError } = await supabase
        .from('maintenance_ticket')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .in('station_id', recoveredStationIds)
        .eq('status', 'open')
        .select('id')

      if (resolveError) throw new Error(resolveError.message)
      resolved = resolvedRows?.length ?? 0
    }

    return json({
      ok: true,
      stations_checked: health.length,
      stations_offline_24h_plus: staleStations.length,
      tickets_created: created,
      tickets_auto_resolved: resolved,
      via: 'supabase-edge-function',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron-station-health]', message)
    return json({ ok: false, error: message }, 500)
  }
})
