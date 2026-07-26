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
  via: 'fetch' | 'browser'
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

export async function GET() {
  const supabase = createAdminClient()

  try {
    // Cheap parallel fetch first — never launch two Chromiums at once.
    const [listingPlain, flowsPlain] = await Promise.all([
      fetchPlain(PMD_LISTING_URL),
      fetchPlain(PMD_RIVER_FLOWS_URL),
    ])

    const listingPage = await ensurePage(PMD_LISTING_URL, listingPlain)
    const flowsPage = await ensurePage(PMD_RIVER_FLOWS_URL, flowsPlain)

    const listingHtml =
      listingPage.html && listingPage.html.length > 500 ? listingPage.html : null
    const riverHtml = flowsPage.html && flowsPage.html.length > 500 ? flowsPage.html : null

    await Promise.all([
      saveScrapeSnapshot(supabase, {
        source: SOURCE,
        url: PMD_LISTING_URL,
        statusCode: listingPage.status || null,
        rawHtml: listingHtml,
        fetchError: listingHtml ? null : listingPage.error ?? `HTTP ${listingPage.status}`,
      }),
      saveScrapeSnapshot(supabase, {
        source: `${SOURCE}_river_flows`,
        url: PMD_RIVER_FLOWS_URL,
        statusCode: flowsPage.status || null,
        rawHtml: riverHtml,
        fetchError: riverHtml ? null : flowsPage.error ?? `HTTP ${flowsPage.status}`,
      }),
    ])

    const { pdfBuffer, pdfError, rivers, ...bulletin } = await buildPmdSnapshotFromHtml({
      listingHtml,
      riverHtml,
      pdfTimeoutMs: 15_000,
    })

    let snapshotPath: string | null = null
    if (pdfBuffer) {
      const uploadPath = `pmd/bulletin_${bulletin.bulletin_id}_${Date.now()}.pdf`
      const { error: uploadError } = await supabase.storage
        .from('raw-snapshots')
        .upload(uploadPath, pdfBuffer, { contentType: 'application/pdf' })
      if (!uploadError) snapshotPath = uploadPath
    }

    const { error: insertError } = await supabase.from('pmd_forecasts').upsert(
      {
        ...bulletin,
        rivers: riversToLegacyJson(rivers),
        snapshot_path: snapshotPath,
      },
      { onConflict: 'bulletin_id' }
    )
    if (insertError) {
      throw new Error(`pmd_forecasts insert failed: ${insertError.message}`)
    }

    await writeIngestStatus(supabase, SOURCE, 'ok')

    return NextResponse.json({
      ok: true,
      bulletinId: bulletin.bulletin_id,
      matchedByDate: bulletin.matched_by_date,
      warningLevel: bulletin.warning_level,
      riversFound: rivers.length,
      listingVia: listingPage.via,
      riverVia: flowsPage.via,
      listingPageOk: Boolean(listingHtml),
      riverFlowsPageOk: Boolean(riverHtml),
      pdfOk: !pdfError && Boolean(pdfBuffer),
      pdfError,
      status: 'ok',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[ingest:${SOURCE}]`, message)
    await writeIngestStatus(supabase, SOURCE, 'failed', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
