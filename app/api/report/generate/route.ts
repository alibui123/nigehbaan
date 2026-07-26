import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadPostEventReport, reportFilename } from '@/lib/post-event-report'
import {
  buildPostEventReportBodyHtml,
  wrapReportHtml,
} from '@/lib/post-event-report-html'

export const runtime = 'nodejs'
export const maxDuration = 60

async function launchBrowser() {
  const { default: puppeteer } = await import('puppeteer-core')

  if (process.env.VERCEL) {
    const { default: chromium } = await import('@sparticuz/chromium')
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1240, height: 1754 },
      executablePath: await chromium.executablePath(),
      headless: true,
    })
  }

  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

  return puppeteer.launch({
    headless: true,
    executablePath,
    defaultViewport: { width: 1240, height: 1754 },
  })
}

/**
 * Generate a post-event PDF from plain HTML (setContent via puppeteer-core).
 * Does not navigate the authenticated report page (avoids login-screen PDFs).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const alertId = searchParams.get('alertId')

  if (!alertId) {
    return NextResponse.json({ error: 'Missing alertId' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const data = await loadPostEventReport(admin, alertId)
  if (!data) {
    return NextResponse.json({ error: 'Alert not found' }, { status: 404 })
  }

  const html = wrapReportHtml(buildPostEventReportBodyHtml(data))
  const filename = reportFilename(data)

  let browser
  try {
    browser = await launchBrowser()
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForSelector('[data-report-ready="true"]', { timeout: 10_000 })

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="width:100%;font-size:8px;color:#94a3b8;padding:0 12mm;display:flex;justify-content:space-between;font-family:Segoe UI,Arial,sans-serif;">
          <span>Nigheban EWS · Post-Event Report · NGB-${data.shortRef}</span>
          <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>
      `,
    })

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('PDF Generation Error:', error)
    return NextResponse.json(
      {
        error: 'Failed to generate PDF',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  } finally {
    if (browser) await browser.close()
  }
}
