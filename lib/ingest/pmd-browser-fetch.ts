import { BROWSER_UA } from '@/lib/ingest/status'

async function launchBrowser() {
  const { default: puppeteer } = await import('puppeteer-core')

  if (process.env.VERCEL) {
    const { default: chromium } = await import('@sparticuz/chromium')
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 720 },
      executablePath: await chromium.executablePath(),
      headless: true,
    })
  }

  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    (process.platform === 'win32'
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : process.platform === 'darwin'
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : '/usr/bin/google-chrome')

  return puppeteer.launch({ headless: true, executablePath })
}

/**
 * Fetch HTML with a real browser when plain `fetch` gets bot-blocked (403/empty).
 * Bounded so cron can still finish under maxDuration.
 */
export async function fetchHtmlWithBrowser(
  url: string,
  options?: { timeoutMs?: number; waitMs?: number }
): Promise<{ ok: boolean; status: number; html: string }> {
  const timeoutMs = options?.timeoutMs ?? 25_000
  const waitMs = options?.waitMs ?? 1500
  const browser = await launchBrowser()

  try {
    const page = await browser.newPage()
    await page.setUserAgent(BROWSER_UA)
    page.setDefaultNavigationTimeout(timeoutMs)

    const res = await page.goto(url, { waitUntil: 'domcontentloaded' })
    if (waitMs > 0) {
      await new Promise((r) => setTimeout(r, waitMs))
    }
    const html = await page.content()
    const status = res?.status() ?? (html.length > 500 ? 200 : 0)

    return { ok: status >= 200 && status < 400 && html.length > 500, status, html }
  } finally {
    await browser.close().catch(() => {})
  }
}
