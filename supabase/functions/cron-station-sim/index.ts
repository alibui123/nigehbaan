import { adminClient, authorize, json, writeIngestStatus } from '../_shared/cron.ts'

const SOURCE = 'station_sim'
const OUTAGE_PROBABILITY = 0.05
const BATTERY_REPLACEMENT_PROBABILITY = 0.05
const LOW_BATTERY_THRESHOLD = 10.5
const FRESH_BATTERY_VOLTAGE = 12.6

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function randomWalk(prev: number, min: number, max: number, maxStep: number) {
  const next = prev + rand(-maxStep, maxStep)
  return Math.max(min, Math.min(max, next))
}

Deno.serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'method not allowed' }, 405)
  }
  if (!authorize(req)) return json({ error: 'unauthorized' }, 401)

  const supabase = adminClient()

  try {
    const { data: stations, error } = await supabase
      .from('station_health')
      .select('station_id, kind, battery_voltage, water_level, rainfall, temperature, flow_rate')

    if (error || !stations) {
      throw new Error(error?.message ?? 'failed to load stations')
    }

    const now = new Date().toISOString()
    const readings: Record<string, unknown>[] = []
    let outageCount = 0

    for (const s of stations) {
      if (Math.random() < OUTAGE_PROBABILITY) {
        outageCount++
        continue
      }

      let battery = s.battery_voltage ?? rand(11.5, 12.6)
      if (battery < LOW_BATTERY_THRESHOLD && Math.random() < BATTERY_REPLACEMENT_PROBABILITY) {
        battery = FRESH_BATTERY_VOLTAGE
      } else {
        battery = Math.max(9.0, battery - rand(0.01, 0.05))
      }

      const water_level = randomWalk(s.water_level ?? rand(0.5, 2.5), 0, 8, 0.3)
      const rainfall = Math.random() < 0.3 ? rand(0, 15) : 0
      const temperature = randomWalk(s.temperature ?? rand(5, 25), -10, 40, 1.5)
      const flow_rate =
        s.kind === 'water_level' ? randomWalk(s.flow_rate ?? rand(10, 100), 0, 500, 15) : null

      readings.push({
        station_id: s.station_id,
        recorded_at: now,
        water_level,
        rainfall,
        temperature,
        battery_voltage: Number(battery.toFixed(2)),
        rssi: Math.round(rand(35, 90)),
        flow_rate,
        is_simulated: true,
      })
    }

    if (readings.length > 0) {
      const { error: insertError } = await supabase.from('station_reading').insert(readings)
      if (insertError) throw new Error(insertError.message)
    }

    await writeIngestStatus(supabase, SOURCE, 'ok')

    return json({
      ok: true,
      source: SOURCE,
      stations_total: stations.length,
      readings_written: readings.length,
      simulated_outages_this_cycle: outageCount,
      via: 'supabase-edge-function',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[${SOURCE}]`, message)
    await writeIngestStatus(supabase, SOURCE, 'failed', message)
    return json({ ok: false, error: message }, 500)
  }
})
