const fs = require('fs')
const cheerio = require('cheerio')

// 1) Parse KML placemarks for discharge / flood level
const kml = fs.readFileSync('scratch/rivers_kmz/doc.kml', 'utf8')
const $k = cheerio.load(kml, { xmlMode: true })
const placemarks = []
$k('Placemark').each((i, el) => {
  const name = $k(el).find('name').first().text().trim()
  const desc = $k(el).find('description').first().text().trim()
  const coords = $k(el).find('coordinates').first().text().trim()
  if (!name && !desc) return
  placemarks.push({ name, desc: desc.slice(0, 500), coords: coords.slice(0, 80) })
})
console.log('placemarks', placemarks.length)
console.log('sample', placemarks.slice(0, 8))

// Find ones with cusecs / flood
const withFlow = placemarks.filter((p) => /cusec|flood|discharge|flow/i.test(p.name + p.desc))
console.log('withFlow', withFlow.length)
console.log(withFlow.slice(0, 10))

// 2) Extract big inline script from river-state
const html = fs.readFileSync('scratch/pmd-river-state.html', 'utf8')
const m = html.match(/<script>([\s\S]{10000,}?)<\/script>/)
if (m) {
  const code = m[1]
  fs.writeFileSync('scratch/pmd-river-state-main.js', code)
  console.log('main script len', code.length)
  // Find object literals mentioning Tarbela / discharge
  for (const needle of ['Tarbela', 'cusecs', 'discharge', 'flood_level', 'floodLevel', 'stations', 'values']) {
    const idx = code.indexOf(needle)
    console.log(needle, idx)
    if (idx >= 0) console.log(code.slice(Math.max(0, idx - 120), idx + 300).replace(/\s+/g, ' '))
  }
}

// 3) Archive old comparison page structure
const arch = fs.readFileSync('scratch/pmd-river-flows-archive.html', 'utf8')
console.log('\narchive len', arch.length)
console.log(arch.slice(0, 1500))
const $a = cheerio.load(arch)
console.log('archive tables', $a('table').length)
$a('table tr').slice(0, 15).each((i, row) => {
  const cells = $a(row).find('td,th').map((j, c) => $a(c).text().replace(/\s+/g, ' ').trim()).get()
  console.log(cells.join(' | '))
})
