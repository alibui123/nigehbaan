import type { SupabaseClient } from '@supabase/supabase-js'
import { writeIngestStatus } from '@/lib/ingest/status'

/** Single hardware-shaped telemetry payload (HTTP push or MQTT bridge → same schema). */
export interface StationTelemetryReading {
  station_id: string
  recorded_at?: string
  water_level?: number | null
  rainfall?: number | null
  temperature?: number | null
  battery_voltage?: number | null
  rssi?: number | null
  flow_rate?: number | null
  is_simulated?: boolean
}

export interface StationTelemetryBatch {
  source?: string
  readings: StationTelemetryReading[]
}

const DEFAULT_SOURCE = 'station_telemetry'

function normalizeReading(r: StationTelemetryReading, fallbackSimulated: boolean) {
  if (!r.station_id || typeof r.station_id !== 'string') {
    throw new Error('each reading requires station_id')
  }
  return {
    station_id: r.station_id,
    recorded_at: r.recorded_at ?? new Date().toISOString(),
    water_level: r.water_level ?? null,
    rainfall: r.rainfall ?? null,
    temperature: r.temperature ?? null,
    battery_voltage: r.battery_voltage ?? null,
    rssi: r.rssi ?? null,
    flow_rate: r.flow_rate ?? null,
    is_simulated: r.is_simulated ?? fallbackSimulated,
  }
}

/**
 * Canonical station ingest path (M1).
 * Simulator cron, HTTP hardware push, and MQTT bridge all land here —
 * so swapping transport later does not change DB writes or alert triggers.
 */
export async function ingestStationTelemetry(
  supabase: SupabaseClient,
  batch: StationTelemetryBatch,
  opts?: { source?: string; defaultSimulated?: boolean }
) {
  const source = opts?.source ?? batch.source ?? DEFAULT_SOURCE
  const defaultSimulated = opts?.defaultSimulated ?? false

  if (!Array.isArray(batch.readings) || batch.readings.length === 0) {
    await writeIngestStatus(supabase, source, 'ok')
    return { inserted: 0 }
  }

  const rows = batch.readings.map((r) => normalizeReading(r, defaultSimulated))
  const { error } = await supabase.from('station_reading').insert(rows)
  if (error) {
    await writeIngestStatus(supabase, source, 'failed', error.message)
    throw new Error(error.message)
  }

  await writeIngestStatus(supabase, source, 'ok')
  return { inserted: rows.length }
}
