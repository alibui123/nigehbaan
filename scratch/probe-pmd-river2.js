const fs = require('fs')
const cheerio = require('cheerio')

const html = fs.readFileSync('scratch/pmd-river-state.html', 'utf8')
const home = fs.readFileSync('scratch/pmd-home.html', 'utf8')

const scriptOpen = /<script\b[^>]*>/gi
const scriptClose = /<\/script>/gi
const scripts = []
let start = 0
while (true) {
  scriptOpen.lastIndex = start
  const open = scriptOpen.exec(html)
  if (!open) break
  const afterOpen = open.index + open[0].length
  scriptClose.lastIndex = afterOpen
  const close = scriptClose.exec(html)
  if (!close) break
  const body = html.slice(afterOpen, close.index)
  scripts.push(body)
  start = close.index + close[0].length
}

console.log('scripts', scripts.length, scripts.map((s) => s.length))
for (const [i, s] of scripts.entries()) {
  if (/FeatureLayer|kmz|popupTemplate|Tarbela|discharge|Graphic|river/i.test(s) && s.length < 250000) {
    console.log('\n==== script', i, 'len', s.length, '====')
    console.log(s.slice(0, 5000))
    if (s.length > 6000) {
      console.log('\n... mid ...\n')
      console.log(s.slice(Math.floor(s.length / 2) - 1500, Math.floor(s.length / 2) + 1500))
      console.log('\n... end ...\n')
      console.log(s.slice(-2500))
    }
  }
}

// Home: rivers at a glance structure
const $ = cheerio.load(home)
console.log('\n=== HOME CARD-LIKE ===')
$('[class*="river"], [class*="glance"], .card, .home-card, .badge').each((i, el) => {
  if (i > 40) return
  const t = $(el).text().replace(/\s+/g, ' ').trim()
  if (t && /indus|kabul|jhelum|chenab|ravi|sutlej|tarbela|flood|cusec/i.test(t)) {
    console.log($(el).attr('class'), '=>', t.slice(0, 200))
  }
})

// Search for JSON-LD or data islands
const dataIslands = [...home.matchAll(/<(?:script|div)[^>]*(?:application\/json|data-rivers|data-stations)[^>]*>([\s\S]*?)<\//gi)]
console.log('data islands', dataIslands.length)

// Find iframe / API for latest flow
const flowMentions = [...home.matchAll(/[^\n]{0,80}(?:Latest flow|Flow of Rivers|river.?state|cusecs?)[^\n]{0,120}/gi)]
console.log('flow mentions', flowMentions.slice(0, 15).map((m) => m[0].replace(/\s+/g, ' ')))
