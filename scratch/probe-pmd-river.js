const cheerio = require('cheerio')
const fs = require('fs')

async function main() {
  const res = await fetch('https://ffd.pmd.gov.pk/river-state', {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Accept: 'text/html',
    },
  })
  console.log('status', res.status)
  const html = await res.text()
  fs.writeFileSync('scratch/pmd-river-state.html', html)
  const $ = cheerio.load(html)
  console.log('tables', $('table').length)
  $('table').each((i, t) => {
    console.log('TABLE', i, 'rows', $(t).find('tr').length)
    $(t)
      .find('tr')
      .slice(0, 12)
      .each((j, row) => {
        const cells = $(row)
          .find('td,th')
          .map((k, c) => $(c).text().replace(/\s+/g, ' ').trim())
          .get()
        console.log(' ', cells.join(' | '))
      })
  })

  // Search for discharge / flood level patterns in page text
  const text = $('body').text().replace(/\s+/g, ' ')
  const cusecs = [...text.matchAll(/([\d,]+)\s*cusecs?/gi)].slice(0, 20)
  console.log('cusecs mentions', cusecs.length, cusecs.slice(0, 5).map((m) => m[0]))

  // Look for JSON/data in scripts
  $('script').each((i, s) => {
    const code = $(s).html() || ''
    if (/Tarbela|discharge|floodLevel|riverStations|stations\s*=/i.test(code) && code.length < 50000) {
      console.log('--- script snippet', i, 'len', code.length, '---')
      console.log(code.slice(0, 3000))
    }
  })

  // Check home page "Rivers at a glance" cards
  const home = await fetch('https://ffd.pmd.gov.pk/home', {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
  })
  const homeHtml = await home.text()
  fs.writeFileSync('scratch/pmd-home.html', homeHtml)
  const $h = cheerio.load(homeHtml)
  // find glance section
  const glance = $h('body').text().match(/Rivers at a glance[\s\S]{0,800}/i)
  console.log('glance text:', glance && glance[0].replace(/\s+/g, ' ').slice(0, 500))

  // any api endpoints in home
  const apis = [...homeHtml.matchAll(/["'](\/api\/[^"']+|https?:\/\/ffd\.pmd\.gov\.pk\/[^"']*(?:river|flow|gauge|hydro)[^"']*)["']/gi)]
  console.log('apis', apis.map((m) => m[1]).slice(0, 30))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
