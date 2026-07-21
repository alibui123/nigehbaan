#!/usr/bin/env node
/**
 * Optional M1 MQTT → HTTP bridge (MVP guide Mosquitto path).
 *
 * Subscribes to station telemetry topics and POSTs batches to
 * /api/ingest/stations — the same intake real HTTP-push hardware uses.
 *
 * Prerequisites:
 *   docker compose -f docker-compose.mqtt.yml up -d
 *   npm install mqtt
 *
 * Env:
 *   MQTT_URL              default mqtt://127.0.0.1:1883
 *   MQTT_TOPIC            default nigheban/stations/+/telemetry
 *   NEXT_PUBLIC_BASE_URL  default http://localhost:3000
 *   STATION_INGEST_SECRET or CRON_SECRET  (Bearer for ingest API)
 */

const { readFileSync, existsSync } = require('node:fs')
const { resolve } = require('node:path')

function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    const key = line.slice(0, i).trim()
    const val = line.slice(i + 1).trim()
    if (!(key in process.env)) process.env[key] = val
  }
}

loadEnvLocal()

const MQTT_URL = process.env.MQTT_URL ?? 'mqtt://127.0.0.1:1883'
const MQTT_TOPIC = process.env.MQTT_TOPIC ?? 'nigheban/stations/+/telemetry'
const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const SECRET = process.env.STATION_INGEST_SECRET || process.env.CRON_SECRET

const FLUSH_MS = Number(process.env.MQTT_BRIDGE_FLUSH_MS ?? 2000)
const MAX_BATCH = Number(process.env.MQTT_BRIDGE_MAX_BATCH ?? 50)

let mqtt
try {
  mqtt = require('mqtt')
} catch {
  console.error('Missing dependency: run `npm install mqtt` then retry.')
  process.exit(1)
}

/** @type {object[]} */
const queue = []
/** @type {ReturnType<typeof setTimeout> | null} */
let flushTimer = null

async function flush() {
  flushTimer = null
  if (queue.length === 0) return
  const readings = queue.splice(0, MAX_BATCH)
  /** @type {Record<string, string>} */
  const headers = { 'Content-Type': 'application/json' }
  if (SECRET) headers.Authorization = `Bearer ${SECRET}`

  try {
    const res = await fetch(`${BASE_URL}/api/ingest/stations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ source: 'station_mqtt_bridge', readings }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error('[mqtt-bridge] ingest failed', res.status, body)
      queue.unshift(...readings)
      return
    }
    console.log(`[mqtt-bridge] forwarded ${readings.length} reading(s) → ingest`)
  } catch (err) {
    console.error('[mqtt-bridge] forward error', err)
    queue.unshift(...readings)
  }
}

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(flush, FLUSH_MS)
}

/**
 * @param {string} topic
 * @param {Buffer} buf
 */
function parsePayload(topic, buf) {
  const text = buf.toString('utf8')
  let data
  try {
    data = JSON.parse(text)
  } catch {
    console.warn('[mqtt-bridge] non-JSON payload on', topic)
    return null
  }

  // Topic: nigheban/stations/{station_id}/telemetry
  const parts = topic.split('/')
  const topicStationId = parts.length >= 3 ? parts[2] : null
  const station_id = data.station_id ?? topicStationId
  if (!station_id) {
    console.warn('[mqtt-bridge] missing station_id', topic)
    return null
  }

  return {
    station_id,
    recorded_at: data.recorded_at ?? data.observed_at ?? new Date().toISOString(),
    water_level: data.water_level ?? data.water_level_m ?? null,
    rainfall: data.rainfall ?? data.rain_mm ?? null,
    temperature: data.temperature ?? data.temp_c ?? null,
    battery_voltage: data.battery_voltage ?? data.battery_v ?? null,
    rssi: data.rssi ?? data.rssi_dbm ?? null,
    flow_rate: data.flow_rate ?? null,
    is_simulated: data.is_simulated ?? true,
  }
}

const client = mqtt.connect(MQTT_URL, {
  clientId: `nigheban-mqtt-bridge-${process.pid}`,
  reconnectPeriod: 3000,
})

client.on('connect', () => {
  console.log(`[mqtt-bridge] connected ${MQTT_URL}`)
  client.subscribe(MQTT_TOPIC, (err) => {
    if (err) console.error('[mqtt-bridge] subscribe failed', err)
    else console.log(`[mqtt-bridge] subscribed ${MQTT_TOPIC}`)
  })
})

client.on('message', (topic, payload) => {
  const reading = parsePayload(topic, payload)
  if (!reading) return
  queue.push(reading)
  if (queue.length >= MAX_BATCH) flush()
  else scheduleFlush()
})

client.on('error', (err) => console.error('[mqtt-bridge]', err.message))

process.on('SIGINT', () => {
  flush().finally(() => {
    client.end(true)
    process.exit(0)
  })
})
