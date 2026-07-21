import { createAdminClient } from '@/lib/supabase/admin'
import {
  ingestStationTelemetry,
  type StationTelemetryBatch,
} from '@/lib/ingest/station-telemetry'
import { NextResponse } from 'next/server'

/**
 * M1 HTTP telemetry intake (hardware-shaped).
 *
 * Real CAE/Sutron/OTT HTTP-push and the optional MQTT→HTTP bridge POST here.
 * Auth: Bearer STATION_INGEST_SECRET (preferred) or CRON_SECRET.
 */
function authorize(request: Request): boolean {
  const authHeader = request.headers.get('authorization')
  const secret = process.env.STATION_INGEST_SECRET || process.env.CRON_SECRET
  if (!secret) return true // local/dev without secrets
  return authHeader === `Bearer ${secret}`
}

export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  try {
    const body = (await request.json()) as StationTelemetryBatch
    const source = body.source ?? 'station_http'
    const result = await ingestStationTelemetry(supabase, body, {
      source,
      defaultSimulated: source === 'station_sim' || source === 'station_mqtt_bridge',
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[ingest:stations]', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
