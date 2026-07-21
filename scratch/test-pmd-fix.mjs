import { createRequire } from 'module'
// Use dynamic import after next isn't available for TS — call HTTP APIs instead.

const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

async function main() {
  const flows = await fetch(`${BASE}/api/pmd/river-flows`).then((r) => r.json())
  console.log('river-flows features', flows.features?.length ?? 0)
  console.log(
    'sample',
    (flows.features || []).slice(0, 5).map((f) => f.properties)
  )

  const ingest = await fetch(`${BASE}/api/ingest/pmd-snapshot`).then(async (r) => ({
    status: r.status,
    body: await r.json(),
  }))
  console.log('ingest', ingest)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
