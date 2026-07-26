import { NextResponse } from 'next/server'

export const runtime = 'edge'

/** Official + mirror GloFAS OWS hosts (same MapServer stack). */
const UPSTREAMS = [
  'https://ows.globalfloods.eu/glofas-ows/ows.py',
  'https://globalfloods-ows.ecmwf.int/glofas-ows/ows.py',
] as const

const LAYER = 'sumAL43EGE'
const MAX_ATTEMPTS = 3
const ATTEMPT_TIMEOUT_MS = 8_000

/** 1×1 transparent PNG — keeps MapLibre quiet when Copernicus is briefly 502. */
const TRANSPARENT_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5WNpoAAAAASUVORK5CYII='
  ),
  (c) => c.charCodeAt(0)
)

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function buildUpstreamUrl(base: string, bbox: string, width: string, height: string, time: string | null) {
  // Keep BBOX raw — MapLibre already substituted {bbox-epsg-3857}.
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    FORMAT: 'image/png',
    TRANSPARENT: 'TRUE',
    LAYERS: LAYER,
    CRS: 'EPSG:3857',
    STYLES: '',
    WIDTH: width,
    HEIGHT: height,
  })
  if (time) params.set('TIME', time)
  return `${base}?${params.toString()}&BBOX=${bbox}`
}

function looksLikePng(buf: ArrayBuffer, contentType: string | null) {
  if (contentType?.includes('png') || contentType?.includes('image/')) {
    const u8 = new Uint8Array(buf)
    return u8.length > 8 && u8[0] === 0x89 && u8[1] === 0x50
  }
  const u8 = new Uint8Array(buf)
  return u8.length > 8 && u8[0] === 0x89 && u8[1] === 0x50
}

/**
 * Same-origin GloFAS WMS proxy.
 * Browser → /api/map/glofas-wms (avoids Referer/CORS quirks on Vercel)
 * → Copernicus OWS with retries across hosts.
 *
 * `?probe=1` returns JSON health instead of a tile (used by the map UI).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const isProbe = searchParams.get('probe') === '1'
  const bbox =
    searchParams.get('BBOX') ??
    (isProbe ? '7800000,3500000,8000000,3700000' : null)
  if (!bbox) {
    return NextResponse.json({ error: 'BBOX required' }, { status: 400 })
  }
  const width = searchParams.get('WIDTH') ?? (isProbe ? '64' : '256')
  const height = searchParams.get('HEIGHT') ?? (isProbe ? '64' : '256')
  const time = searchParams.get('TIME')

  let lastStatus = 0

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const base = UPSTREAMS[attempt % UPSTREAMS.length]
    const url = buildUpstreamUrl(base, bbox, width, height, time)
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'image/png,image/*;q=0.8,*/*;q=0.5',
          'User-Agent': 'NighebanEWS/1.0 (GloFAS map proxy)',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      })
      lastStatus = res.status
      if (!res.ok) {
        await sleep(200 * (attempt + 1))
        continue
      }
      const buf = await res.arrayBuffer()
      if (!looksLikePng(buf, res.headers.get('content-type'))) {
        await sleep(200 * (attempt + 1))
        continue
      }
      if (isProbe) {
        return NextResponse.json(
          { ok: true, upstream: base, bytes: buf.byteLength },
          { headers: { 'Cache-Control': 'no-store' } }
        )
      }
      return new NextResponse(buf, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
          'Access-Control-Allow-Origin': '*',
          'X-Glofas-Upstream': base,
        },
      })
    } catch {
      await sleep(250 * (attempt + 1))
    }
  }

  if (isProbe) {
    return NextResponse.json(
      { ok: false, upstream: 'unavailable', lastStatus },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  // Soft failure: transparent tile so the layer stays enabled; UI notice via probe.
  return new NextResponse(TRANSPARENT_PNG, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store',
      'X-Glofas-Upstream': 'unavailable',
      'X-Glofas-Last-Status': String(lastStatus || 0),
    },
  })
}
