const fs = require('fs')

const code = fs.readFileSync('scratch/pmd-river-state-main.js', 'utf8')

// Find all object literals that look like gauge stations
const re = /\{\s*name:\s*"([^"]+)"\s*,\s*longitude:\s*([-\d.]+)\s*,\s*latitude:\s*([-\d.]+)[\s\S]*?\}/g
let m
const stations = []
while ((m = re.exec(code)) !== null) {
  const chunk = m[0]
  // only take reasonable-sized objects
  if (chunk.length > 2000) continue
  const get = (key) => {
    const km = chunk.match(new RegExp(key + ':\\s*"([^"]*)"'))
    const kn = chunk.match(new RegExp(key + ':\\s*([\\d.]+)'))
    return km ? km[1] : kn ? kn[1] : null
  }
  stations.push({
    name: m[1],
    longitude: Number(m[2]),
    latitude: Number(m[3]),
    area_name: get('area_name'),
    status: get('status'),
    discharge: get('discharge'),
    level: get('level'),
    type: get('type'),
    rawLen: chunk.length,
    raw: chunk.slice(0, 400),
  })
}

console.log('stations', stations.length)
console.log(JSON.stringify(stations.slice(0, 15), null, 2))
console.log('statuses', [...new Set(stations.map((s) => s.status))])
console.log('with discharge', stations.filter((s) => s.discharge).length)

// Also try alternate pattern: var stations = [...]
const idx = code.indexOf('name: "Tarbela Dam"')
console.log('\ncontext around Tarbela:\n')
console.log(code.slice(idx - 200, idx + 800))
