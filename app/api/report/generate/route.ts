import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadPostEventReport } from '@/lib/post-event-report'
import { buildPostEventReportPdf } from '@/lib/post-event-report-pdf'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * Post-event PDF via pdfkit (no Chromium).
 * Puppeteer/@sparticuz/chromium fails on Vercel with puppeteer-core version skew.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const alertId = searchParams.get('alertId')

  if (!alertId) {
    return NextResponse.json({ error: 'Missing alertId' }, { status: 400 })
  }

  try {
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

    const { buffer, filename } = await buildPostEventReportPdf(data)

    return new NextResponse(new Uint8Array(buffer), {
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
  }
}
