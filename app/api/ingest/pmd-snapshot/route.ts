import { createAdminClient } from '@/lib/supabase/admin'
import { fetchHtmlWithBrowser } from '@/lib/ingest/pmd-browser-fetch'
import {
  buildPmdSnapshotFromHtml,
  PMD_LISTING_URL,
  PMD_RIVER_FLOWS_URL,
  riversToLegacyJson,
} from '@/lib/ingest/pmd-fetch'
import { BROWSER_UA, saveScrapeSnapshot, writeIngestStatus } from '@/lib/ingest/status'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
/** PDF + scrape (+ optional Chromium) needs headroom on Vercel cron. */
export const maxDuration = 60

const SOURCE = 'pmd_ffd'

type PageResult = {
  status: number
  html: string | null
  via: 'fetch' | 'browser' | 'posted'
  error?: string
}

function listingLooksValid(html: string) {
  return /\/bulletin\/\d+\/download/i.test(html)
}

function riverPageLooksValid(html: string) {
  return /discharge\s*:/i.test(html) || /cusecs/i.test(html) || /flood\s+level/i.test(html)
}

function pageLooksUseful(url: string, html: string) {
  if (url.includes('bulletin')) return listingLooksValid(html)
  if (url.includes('river-state') || url.includes('river-flows')) return riverPageLooksValid(html)
  return html.length > 2000
}

function authorize(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return false
  }
  return true
}

async function fetchPlain(url: string): Promise<PageResult> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html' },
      cache: 'no-store',
    })
    const html = await res.text()
    if (res.ok && pageLooksUseful(url, html)) {
      return { status: res.status, html, via: 'fetch' }
    }
    return {
      status: res.status,
      html,
      via: 'fetch',
      error: `HTTP ${res.status}, body ${html.length}b (missing expected PMD content)`,
    }
  } catch (err) {
    return {
      status: 0,
      html: null,
      via: 'fetch',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function ensurePage(url: string, plain: PageResult): Promise<PageResult> {
  if (plain.html && pageLooksUseful(url, plain.html) && plain.status >= 200 && plain.status < 400) {
    return plain
  }
  try {
    const browser = await fetchHtmlWithBrowser(url, { timeoutMs: 25_000, waitMs: 2500 })
    if (pageLooksUseful(url, browser.html)) {
      return { status: browser.status, html: browser.html, via: 'browser' }
    }
    return {
      status: browser.status,
      html: browser.html || plain.html,
      via: 'browser',
      error: plain.error ?? `browser returned unusable HTML (${browser.html.length}b)`,
    }
  } catch (err) {
    return {
      ...plain,
      error: `${plain.error ?? 'fetch failed'}; browser: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

async function runIngest(params: {
  listingHtml: string | null
  riverHtml: string | null
  pdfBuffer?: Buffer | null
  pdfText?: string | null
  listingVia: PageResult['via']
  riverVia: PageResult['via']
  listingStatus?: number
  riverStatus?: number
  listingError?: string
  riverError?: string
}) {
  const supabase = createAdminClient()

  await Promise.all([
    saveScrapeSnapshot(supabase, {
      source: SOURCE,
      url: PMD_LISTING_URL,
      statusCode: params.listingStatus ?? null,
      rawHtml: params.listingHtml,
      fetchError: params.listingHtml ? null : params.listingError ?? 'missing listing html',
    }),
    saveScrapeSnapshot(supabase, {
      source: `${SOURCE}_river_flows`,
      url: PMD_RIVER_FLOWS_URL,
      statusCode: params.riverStatus ?? null,
      rawHtml: params.riverHtml,
      fetchError: params.riverHtml ? null : params.riverError ?? 'missing river html',
    }),
  ])

  const { pdfBuffer, pdfError, rivers, ...bulletin } = await buildPmdSnapshotFromHtml({
    listingHtml: params.listingHtml,
    riverHtml: params.riverHtml,
    pdfBuffer: params.pdfBuffer,
    pdfText: params.pdfText,
    pdfTimeoutMs: 15_000,
  })

  let snapshotPath: string | null = null
  if (pdfBuffer && pdfBuffer.length > 1000) {
    const uploadPath = `pmd/bulletin_${bulletin.bulletin_id}_${Date.now()}.pdf`
    const { error: uploadError } = await supabase.storage
      .from('raw-snapshots')
      .upload(uploadPath, pdfBuffer, { contentType: 'application/pdf' })
    if (!uploadError) snapshotPath = uploadPath
  }

  const forecastRow = {
    bulletin_id: bulletin.bulletin_id,
    matched_by_date: bulletin.matched_by_date,
    warning_level: bulletin.warning_level,
    forecast_text: bulletin.forecast_text,
    rivers: riversToLegacyJson(rivers),
    snapshot_path: snapshotPath,
    source_url: bulletin.source_url,
    fetched_at: bulletin.fetched_at,
  }

  const { data: existing, error: existingError } = await supabase
    .from('pmd_forecasts')
    .select('id')
    .eq('bulletin_id', bulletin.bulletin_id)
    .maybeSingle()
  if (existingError) {
    throw new Error(`pmd_forecasts lookup failed: ${existingError.message}`)
  }

  const { error: insertError } = existing
    ? await supabase.from('pmd_forecasts').update(forecastRow).eq('id', existing.id)
    : await supabase.from('pmd_forecasts').insert(forecastRow)
  if (insertError) {
    throw new Error(`pmd_forecasts insert failed: ${insertError.message}`)
  }

  await writeIngestStatus(supabase, SOURCE, 'ok')

  return {
    ok: true as const,
    bulletinId: bulletin.bulletin_id,
    matchedByDate: bulletin.matched_by_date,
    warningLevel: bulletin.warning_level,
    riversFound: rivers.length,
    listingVia: params.listingVia,
    riverVia: params.riverVia,
    listingPageOk: Boolean(params.listingHtml),
    riverFlowsPageOk: Boolean(params.riverHtml),
    pdfOk: !pdfError && Boolean(pdfBuffer),
    pdfError,
    status: 'ok' as const,
  }
}

/** Vercel cron / manual: fetch from this runtime (often bot-blocked). */
export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  try {
    const [listingPlain, flowsPlain] = await Promise.all([
      fetchPlain(PMD_LISTING_URL),
      fetchPlain(PMD_RIVER_FLOWS_URL),
    ])

    const listingPage = await ensurePage(PMD_LISTING_URL, listingPlain)
    const flowsPage = await ensurePage(PMD_RIVER_FLOWS_URL, flowsPlain)

    const listingHtml =
      listingPage.html && pageLooksUseful(PMD_LISTING_URL, listingPage.html)
        ? listingPage.html
        : listingPage.html && listingPage.html.length > 500
          ? listingPage.html
          : null
    const riverHtml =
      flowsPage.html && pageLooksUseful(PMD_RIVER_FLOWS_URL, flowsPage.html)
        ? flowsPage.html
        : flowsPage.html && flowsPage.html.length > 500
          ? flowsPage.html
          : null

    const result = await runIngest({
      listingHtml,
      riverHtml,
      listingVia: listingPage.via,
      riverVia: flowsPage.via,
      listingStatus: listingPage.status,
      riverStatus: flowsPage.status,
      listingError: listingPage.error,
      riverError: flowsPage.error,
    })
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[ingest:${SOURCE}]`, message)
    await writeIngestStatus(supabase, SOURCE, 'failed', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

/**
 * Preferred path on Hobby: scrape PMD off-Vercel (GitHub runner or laptop),
 * extract PDF text there, then POST here. Vercel IPs are often bot-blocked and
 * cannot re-download the bulletin PDF.
 */
export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  try {
    const body = (await request.json()) as {
      listingHtml?: string | null
      riverHtml?: string | null
      pdfBase64?: string | null
      pdfText?: string | null
    }

    const listingHtml =
      typeof body.listingHtml === 'string' && body.listingHtml.length > 500
        ? body.listingHtml
        : null
    const riverHtml =
      typeof body.riverHtml === 'string' && body.riverHtml.length > 500 ? body.riverHtml : null
    const pdfText =
      typeof body.pdfText === 'string' && body.pdfText.trim().length > 40 ? body.pdfText : null
    const pdfBuffer =
      typeof body.pdfBase64 === 'string' && body.pdfBase64.length > 1000
        ? Buffer.from(body.pdfBase64, 'base64')
        : null

    if (!listingHtml && !riverHtml && !pdfBuffer && !pdfText) {
      throw new Error('POST body must include listingHtml, riverHtml, pdfText, and/or pdfBase64')
    }

    const result = await runIngest({
      listingHtml,
      riverHtml,
      pdfBuffer,
      pdfText,
      listingVia: 'posted',
      riverVia: 'posted',
      listingStatus: listingHtml ? 200 : 0,
      riverStatus: riverHtml ? 200 : 0,
    })
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[ingest:${SOURCE}]`, message)
    await writeIngestStatus(supabase, SOURCE, 'failed', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
