import * as cheerio from 'cheerio'
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import { BROWSER_UA } from '@/lib/ingest/status'
import { normalizeFloodLevel } from '@/lib/pmd/rivers'

export const PMD_LISTING_URL = 'https://ffd.pmd.gov.pk/bulletin/bulletin'
/** Live river gauge map — replaced the retired /river-flows-comparison page. */
export const PMD_RIVER_FLOWS_URL = 'https://ffd.pmd.gov.pk/river-state'
/** Legacy path kept for redirects / drift detection. */
export const PMD_RIVER_FLOWS_LEGACY_URL = 'https://ffd.pmd.gov.pk/river-flows-comparison'

export interface PmdRiverReading {
  name: string
  location: string | null
  flow_cusecs: number | null
  flood_level: string | null
  lat?: number | null
  lon?: number | null
}

export interface PmdBulletin {
  bulletin_id: number
  matched_by_date: boolean
  warning_level: string | null
  forecast_text: string
  rivers: PmdRiverReading[]
  fetched_at: string
  source_url: string
}

function todayCandidates(): string[] {
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = now.getFullYear()
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  const monthShort = monthNames[now.getMonth()].slice(0, 3)

  return [
    `${dd}-${mm}-${yyyy}`,
    `${dd}/${mm}/${yyyy}`,
    `${dd} ${monthNames[now.getMonth()]} ${yyyy}`,
    `${dd} ${monthShort} ${yyyy}`,
    `${monthShort} ${dd}, ${yyyy}`,
  ]
}

interface BulletinLink {
  id: number
  href: string
  matchedByDate: boolean
}

function findTodaysBulletin(html: string): BulletinLink {
  const $ = cheerio.load(html)
  const candidates = todayCandidates()
  const links: { id: number; href: string; rowText: string }[] = []

  $('a[href*="/bulletin/"][href*="/download"]').each((_, el) => {
    const href = $(el).attr('href') ?? ''
    const idMatch = href.match(/\/bulletin\/(\d+)\/download/)
    if (!idMatch) return
    const rowText = $(el).closest('tr, li, div').text().trim() || $(el).text().trim()
    links.push({ id: Number(idMatch[1]), href, rowText })
  })

  if (links.length === 0) {
    throw new Error('No bulletin download links found — PMD listing page structure may have changed')
  }

  const dateMatch = links.find((l) => candidates.some((c) => l.rowText.includes(c)))
  if (dateMatch) {
    return { id: dateMatch.id, href: dateMatch.href, matchedByDate: true }
  }

  const highest = links.reduce((a, b) => (b.id > a.id ? b : a))
  return { id: highest.id, href: highest.href, matchedByDate: false }
}

function resolveUrl(href: string, base = PMD_LISTING_URL): string {
  return href.startsWith('http') ? href : new URL(href, base).toString()
}

const FLOOD_LEVEL_RE =
  /\b(Low|Medium|High|Very High|Exceptionally High)\s+Flood\b/i

function parseFlowToken(raw: string): number | null {
  const n = parseInt(raw.replace(/,/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

/** Parse river rows from bulletin PDF plain text. */
export function parseBulletinText(text: string) {
  const warningMatch = text.match(FLOOD_LEVEL_RE)

  const rivers: PmdRiverReading[] = []
  const lines = text.split(/\r?\n/)

  for (const line of lines) {
    const levelMatch = line.match(FLOOD_LEVEL_RE)
    const flowMatch = line.match(/([\d,]+)\s*cusecs/i)
    if (!flowMatch && !levelMatch) continue

    const atMatch = line.match(/([A-Za-z]+)\s+at\s+([A-Za-z\s]+?)(?:\s+\d|\s+Low|\s+Medium|\s+High|$)/i)
    if (atMatch) {
      rivers.push({
        name: atMatch[1].trim(),
        location: atMatch[2].trim(),
        flow_cusecs: flowMatch ? parseFlowToken(flowMatch[1]) : null,
        flood_level: levelMatch ? levelMatch[0].replace(/\s+/g, ' ').trim() : null,
      })
      continue
    }

    const generic = line.match(/([A-Z][a-zA-Z\s]{2,25}?)\s+[:\-]?\s*([\d,]+)\s*cusecs/i)
    if (generic) {
      rivers.push({
        name: generic[1].trim(),
        location: null,
        flow_cusecs: parseFlowToken(generic[2]),
        flood_level: levelMatch ? levelMatch[0].replace(/\s+/g, ' ').trim() : null,
      })
    }
  }

  if (rivers.length === 0) {
    const riverRowRegex =
      /([A-Z][a-zA-Z\s]{2,30}?)\s+(?:at\s+([A-Za-z\s]+))?[:\-]?\s*([\d,]+)\s*cusecs/gi
    let m: RegExpExecArray | null
    while ((m = riverRowRegex.exec(text)) !== null) {
      rivers.push({
        name: m[1].trim(),
        location: m[2]?.trim() ?? null,
        flow_cusecs: parseFlowToken(m[3]),
        flood_level: null,
      })
    }
  }

  return {
    warningLevel: warningMatch ? warningMatch[0].replace(/\s+/g, ' ').trim() : null,
    forecastText: text.trim(),
    rivers: dedupeRivers(rivers),
  }
}

/** Map FFD river-state status codes → CAP-style flood level labels. */
export function statusToFloodLevel(status: string | null | undefined): string | null {
  if (!status) return null
  const s = status.trim().toUpperCase().replace(/_/g, ' ')
  if (s === 'NORMAL' || s === 'NORMAL FLOW') return 'Normal Flow'
  if (s === 'LOW' || s.includes('LOW FLOOD')) return 'Low Flood'
  if (s === 'MEDIUM' || s.includes('MEDIUM FLOOD')) return 'Medium Flood'
  if (s === 'HIGH' && !s.includes('VERY') && !s.includes('EXCEPT')) return 'High Flood'
  if (s.includes('VERY HIGH')) return 'Very High Flood'
  if (s.includes('EXCEPTIONALLY')) return 'Exceptionally High Flood'
  return status.trim()
}

function riverNameFromArea(area: string | null, fallback: string): string {
  if (!area || /^n\/?a$/i.test(area.trim())) return fallback
  return area.replace(/\s+River$/i, '').trim() || fallback
}

/**
 * Parse gauge objects embedded in /river-state ArcGIS page JS.
 * Shape: { name, longitude, latitude, area_name, status, discharge, ... }
 */
export function parseRiverStateStations(html: string): PmdRiverReading[] {
  const rivers: PmdRiverReading[] = []
  const re =
    /\{\s*name:\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*,\s*longitude:\s*([-\d.]+)\s*,\s*latitude:\s*([-\d.]+)([\s\S]*?)\}/g

  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const block = m[0]
    if (block.length > 2500) continue
    if (!/discharge\s*:/.test(block)) continue

    const field = (key: string): string | null => {
      const km = block.match(new RegExp(`${key}:\\s*"((?:\\\\.|[^"\\\\])*)"`))
      return km ? km[1].replace(/\\"/g, '"').replace(/\\\//g, '/') : null
    }

    const station = m[1].replace(/\\"/g, '"')
    const lon = Number(m[2])
    const lat = Number(m[3])
    const area = field('area_name')
    const status = field('status')
    const discharge = field('discharge')

    rivers.push({
      name: riverNameFromArea(area, station),
      location: station,
      flow_cusecs: discharge ? parseFlowToken(discharge) : null,
      flood_level: statusToFloodLevel(status),
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
    })
  }

  return dedupeRivers(rivers)
}

/** Fallback: scrape HTML table rows (legacy /river-flows-comparison layout). */
export function parseRiverFlowsTable(html: string): PmdRiverReading[] {
  const $ = cheerio.load(html)
  const rivers: PmdRiverReading[] = []

  $('table tr').each((_, row) => {
    const cells = $(row)
      .find('td, th')
      .map((__, c) => $(c).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter(Boolean)
    if (cells.length < 2) return

    const joined = cells.join(' ')
    const flowMatch = joined.match(/([\d,]+)\s*cusecs/i)
    const levelMatch = joined.match(FLOOD_LEVEL_RE)
    if (!flowMatch && !levelMatch) return

    const name = cells[0] ?? 'Unknown'
    const location = cells.length > 3 ? cells[1] : null

    rivers.push({
      name,
      location,
      flow_cusecs: flowMatch ? parseFlowToken(flowMatch[1]) : null,
      flood_level: levelMatch ? levelMatch[0].replace(/\s+/g, ' ').trim() : null,
    })
  })

  return dedupeRivers(rivers)
}

/** Parse already-fetched river-state / flows HTML (no network). */
export function parseRiverFlowsHtml(html: string): PmdRiverReading[] {
  const fromStations = parseRiverStateStations(html)
  if (fromStations.length > 0) return fromStations
  return parseRiverFlowsTable(html)
}

/** Scrape live river gauge page (S3 MVP). Prefers /river-state JS gauges; falls back to HTML tables. */
export async function fetchPmdRiverFlowsComparison(): Promise<PmdRiverReading[]> {
  const res = await fetch(PMD_RIVER_FLOWS_URL, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html' },
    cache: 'no-store',
  })
  if (!res.ok) return []

  const html = await res.text()
  return parseRiverFlowsHtml(html)
}

export function dedupeRivers(rivers: PmdRiverReading[]): PmdRiverReading[] {
  const seen = new Set<string>()
  const out: PmdRiverReading[] = []
  for (const r of rivers) {
    const key = `${r.name}|${r.location ?? ''}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

/** Merge HTML river table (preferred) with PDF bulletin rivers. */
export function mergeRiverSources(htmlRivers: PmdRiverReading[], pdfRivers: PmdRiverReading[]) {
  if (htmlRivers.length === 0) return pdfRivers
  if (pdfRivers.length === 0) return htmlRivers
  return dedupeRivers([...htmlRivers, ...pdfRivers])
}

/** Legacy shape for DB jsonb compatibility. */
export function riversToLegacyJson(rivers: PmdRiverReading[]) {
  return rivers.map((r) => ({
    name: r.location ? `${r.name} at ${r.location}` : r.name,
    level: r.flood_level,
    flow: r.flow_cusecs != null ? String(r.flow_cusecs) : null,
    flood_level_normalized: normalizeFloodLevel(r.flood_level),
    location: r.location,
    flow_cusecs: r.flow_cusecs,
    lat: r.lat ?? null,
    lon: r.lon ?? null,
  }))
}

export function legacyJsonToRivers(raw: unknown): PmdRiverReading[] {
  if (!Array.isArray(raw)) return []
  return raw.map((r: Record<string, unknown>) => ({
    name: String(r.name ?? '').split(' at ')[0] ?? 'Unknown',
    location:
      (r.location as string) ??
      (String(r.name ?? '').includes(' at ') ? String(r.name).split(' at ')[1] : null),
    flow_cusecs:
      r.flow_cusecs != null
        ? Number(r.flow_cusecs)
        : r.flow != null
          ? parseFlowToken(String(r.flow))
          : null,
    flood_level: (r.level as string) ?? (r.flood_level as string) ?? null,
    lat: r.lat != null ? Number(r.lat) : null,
    lon: r.lon != null ? Number(r.lon) : null,
  }))
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

/** Parse an already-downloaded bulletin PDF (no network). */
export async function parsePmdBulletinPdf(
  pdfBuffer: Buffer,
  meta: { bulletinId: number; matchedByDate: boolean; sourceUrl: string }
): Promise<PmdBulletin & { pdfBuffer: Buffer }> {
  const { text } = await withTimeout(pdfParse(pdfBuffer), 15_000, 'Bulletin PDF parse')
  const parsed = parseBulletinText(text)

  return {
    bulletin_id: meta.bulletinId,
    matched_by_date: meta.matchedByDate,
    warning_level: parsed.warningLevel,
    forecast_text: parsed.forecastText,
    rivers: parsed.rivers,
    fetched_at: new Date().toISOString(),
    source_url: meta.sourceUrl,
    pdfBuffer,
  }
}

/** Download + parse bulletin PDF from an already-fetched listing page. */
export async function fetchPmdBulletinFromListing(
  listingHtml: string,
  options?: { pdfTimeoutMs?: number; pdfBuffer?: Buffer | null }
): Promise<PmdBulletin & { pdfBuffer: Buffer }> {
  const bulletin = findTodaysBulletin(listingHtml)
  const pdfUrl = resolveUrl(bulletin.href)

  let pdfBuffer = options?.pdfBuffer ?? null
  if (!pdfBuffer) {
    const pdfTimeoutMs = options?.pdfTimeoutMs ?? 20_000
    const pdfRes = await withTimeout(
      fetch(pdfUrl, {
        headers: { 'User-Agent': BROWSER_UA },
        cache: 'no-store',
      }),
      pdfTimeoutMs,
      'Bulletin PDF fetch'
    )
    if (!pdfRes.ok) {
      throw new Error(`Bulletin PDF fetch failed (id ${bulletin.id}): HTTP ${pdfRes.status}`)
    }
    pdfBuffer = Buffer.from(await pdfRes.arrayBuffer())
  }

  return parsePmdBulletinPdf(pdfBuffer, {
    bulletinId: bulletin.id,
    matchedByDate: bulletin.matchedByDate,
    sourceUrl: pdfUrl,
  })
}

/**
 * Build snapshot from already-fetched HTML. PDF is best-effort — river-state
 * gauges alone are enough to keep the feed healthy on a tight serverless budget.
 * Prefer passing `pdfBuffer` or `pdfText` when the runtime IP is blocked by PMD
 * (common on Vercel). Prefer `pdfText` over base64 PDF to stay under body size limits.
 */
export async function buildPmdSnapshotFromHtml(params: {
  listingHtml: string | null
  riverHtml: string | null
  pdfBuffer?: Buffer | null
  pdfText?: string | null
  pdfTimeoutMs?: number
}): Promise<PmdBulletin & { pdfBuffer: Buffer | null; pdfError: string | null }> {
  const htmlRivers = params.riverHtml ? parseRiverFlowsHtml(params.riverHtml) : []

  let link: BulletinLink | null = null
  let listingError: string | null = null
  if (params.listingHtml) {
    try {
      link = findTodaysBulletin(params.listingHtml)
    } catch (err) {
      listingError = err instanceof Error ? err.message : String(err)
    }
  } else {
    listingError = 'Listing page unavailable'
  }

  const fallbackBulletinId = Number(
    `${new Date().getUTCFullYear()}${String(new Date().getUTCMonth() + 1).padStart(2, '0')}${String(new Date().getUTCDate()).padStart(2, '0')}`
  )
  const bulletinId = link?.id ?? fallbackBulletinId
  const sourceUrl = link ? resolveUrl(link.href) : PMD_LISTING_URL

  let bulletin: (PmdBulletin & { pdfBuffer: Buffer }) | null = null
  let pdfError: string | null = listingError

  if (typeof params.pdfText === 'string' && params.pdfText.trim().length > 40) {
    try {
      const parsed = parseBulletinText(params.pdfText)
      bulletin = {
        bulletin_id: bulletinId,
        matched_by_date: link?.matchedByDate ?? false,
        warning_level: parsed.warningLevel,
        forecast_text: parsed.forecastText,
        rivers: parsed.rivers,
        fetched_at: new Date().toISOString(),
        source_url: sourceUrl,
        pdfBuffer: params.pdfBuffer ?? Buffer.alloc(0),
      }
      pdfError = null
    } catch (err) {
      pdfError = err instanceof Error ? err.message : String(err)
    }
  }

  if (!bulletin && params.pdfBuffer && params.pdfBuffer.length > 1000) {
    try {
      bulletin = await parsePmdBulletinPdf(params.pdfBuffer, {
        bulletinId,
        matchedByDate: link?.matchedByDate ?? false,
        sourceUrl,
      })
      pdfError = null
    } catch (err) {
      pdfError = err instanceof Error ? err.message : String(err)
    }
  }

  if (!bulletin && link) {
    try {
      bulletin = await fetchPmdBulletinFromListing(params.listingHtml!, {
        pdfTimeoutMs: params.pdfTimeoutMs,
        pdfBuffer: params.pdfBuffer,
      })
      pdfError = null
    } catch (err) {
      pdfError = err instanceof Error ? err.message : String(err)
    }
  }

  const merged = mergeRiverSources(htmlRivers, bulletin?.rivers ?? [])

  if (merged.length === 0 && !bulletin?.forecast_text?.trim()) {
    throw new Error(
      pdfError
        ? `PMD ingest failed — no river gauges and PDF error: ${pdfError}`
        : 'PMD ingest failed — no river gauges and no bulletin text'
    )
  }

  if (bulletin) {
    return {
      ...bulletin,
      rivers: merged,
      forecast_text:
        bulletin.forecast_text.trim() ||
        `PMD FFD bulletin #${bulletin.bulletin_id} (PDF text thin; ${merged.length} gauges from river-state).`,
      pdfError,
    }
  }

  // River-state-only fallback — reuse real bulletin id when listing parsed.
  return {
    bulletin_id: bulletinId,
    matched_by_date: link?.matchedByDate ?? false,
    warning_level: null,
    forecast_text: `PMD FFD river-state snapshot (${merged.length} gauges). Bulletin PDF unavailable: ${pdfError ?? 'unknown'}`,
    rivers: merged,
    fetched_at: new Date().toISOString(),
    source_url: link ? resolveUrl(link.href) : PMD_RIVER_FLOWS_URL,
    pdfBuffer: null,
    pdfError,
  }
}

/** Full S3 ingest: daily bulletin PDF + river-flows page (used by map live fallback). */
export async function fetchPmdFfdSnapshot(): Promise<PmdBulletin & { pdfBuffer: Buffer | null }> {
  const [listingRes, flowsRes] = await Promise.all([
    fetch(PMD_LISTING_URL, {
      headers: { 'User-Agent': BROWSER_UA },
      cache: 'no-store',
    }),
    fetch(PMD_RIVER_FLOWS_URL, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html' },
      cache: 'no-store',
    }),
  ])

  const listingHtml = listingRes.ok ? await listingRes.text() : null
  const riverHtml = flowsRes.ok ? await flowsRes.text() : null
  const snap = await buildPmdSnapshotFromHtml({ listingHtml, riverHtml })
  return snap
}

/** Fetch and parse the latest PMD FFD flood bulletin PDF. */
export async function fetchPmdBulletin(): Promise<PmdBulletin & { pdfBuffer: Buffer }> {
  const listingRes = await fetch(PMD_LISTING_URL, {
    headers: { 'User-Agent': BROWSER_UA },
    cache: 'no-store',
  })
  if (!listingRes.ok) {
    throw new Error(`Listing page fetch failed: HTTP ${listingRes.status}`)
  }
  const listingHtml = await listingRes.text()
  const bulletin = await fetchPmdBulletinFromListing(listingHtml)

  if (!bulletin.forecast_text.trim()) {
    throw new Error(
      `PDF parse produced empty text for bulletin ${bulletin.bulletin_id} — layout change or scanned PDF`
    )
  }

  return bulletin
}
