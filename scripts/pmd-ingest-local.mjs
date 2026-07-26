/**
 * Local/off-Vercel PMD FFD ingest helper.
 * ffd.pmd.gov.pk blocks Vercel + GitHub Actions IPs; run this on a normal network.
 *
 * Usage (from repo root, with .env.local loaded by Next OR set APP_URL + CRON_SECRET):
 *   node scripts/pmd-ingest-local.mjs
 *   node scripts/pmd-ingest-local.mjs https://nigehbaan1.vercel.app
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

function loadEnvLocal() {
  const envPath = path.join(root, '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    if (!process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}

loadEnvLocal()

const APP_URL = (process.argv[2] || process.env.APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')
const CRON_SECRET = process.env.CRON_SECRET
if (!CRON_SECRET) {
  console.error('Set CRON_SECRET (e.g. in .env.local)')
  process.exit(1)
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, redirect: 'follow' })
  const buf = Buffer.from(await res.arrayBuffer())
  console.log(`GET ${url} -> ${res.status} (${buf.length}b)`)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return buf
}

const listing = await get('https://ffd.pmd.gov.pk/bulletin/bulletin')
const html = listing.toString('utf8')
const ids = [...html.matchAll(/\/bulletin\/(\d+)\/download/g)].map((m) => Number(m[1]))
if (!ids.length) throw new Error('No bulletin download links')
const bulletinId = Math.max(...ids)
console.log('bulletin', bulletinId)

const pdf = await get(`https://ffd.pmd.gov.pk/bulletin/${bulletinId}/download`)
const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default
const { text } = await pdfParse(pdf)
console.log('pdf text chars', text.length)

const body = {
  listingHtml: html,
  pdfText: text,
}

const postUrl = `${APP_URL}/api/ingest/pmd-snapshot`
console.log('POST', postUrl)
const post = await fetch(postUrl, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${CRON_SECRET}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
})
const out = await post.text()
console.log(post.status, out.slice(0, 2000))
if (!post.ok) process.exit(1)
