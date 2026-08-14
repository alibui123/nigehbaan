/**
 * One-shot dashboard bootstrap. Survives React Strict Mode remounts and
 * client navigations within the same JS realm so the Pakistan map loader
 * only ever runs 0→100 once per login / cold load.
 */

type Listener = (progress: number, done: boolean) => void

const listeners = new Set<Listener>()

let progress = 0
let done = false
let started = false
let dataReady = false
let mapReady = false
let districtGeo: Record<string, unknown> | null = null

const BOOT_ENDPOINTS: { key: string; url: string; weight: number }[] = [
  { key: 'districts', url: '/api/districts', weight: 35 },
  { key: 'flood', url: '/api/flood-forecast', weight: 12 },
  { key: 'ffd', url: '/api/pmd/river-flows', weight: 12 },
  { key: 'fires', url: '/api/hazards?hazard=fire', weight: 12 },
  { key: 'earthquakes', url: '/api/hazards?hazard=earthquake', weight: 12 },
  { key: 'glacial', url: '/api/glacial-lakes', weight: 12 },
]

function emit() {
  for (const fn of listeners) fn(progress, done)
}

function setProgress(next: number) {
  const clamped = Math.max(progress, Math.min(done ? 100 : 99, next))
  if (clamped === progress) return
  progress = clamped
  emit()
}

function tryComplete() {
  if (done) return
  if (!dataReady || !mapReady) return
  done = true
  progress = 100
  emit()
  try {
    sessionStorage.setItem('nigheban:boot-done', '1')
  } catch {
    /* ignore */
  }
}

export function getBootProgress() {
  return progress
}

export function subscribeDashboardBoot(listener: Listener): () => void {
  listeners.add(listener)
  listener(progress, done)
  return () => {
    listeners.delete(listener)
  }
}

export function getBootDistrictGeo() {
  return districtGeo
}

export function isDashboardBootDone() {
  return done
}

export function markDashboardMapReady() {
  mapReady = true
  setProgress(96)
  tryComplete()
}

export function startDashboardBootstrap() {
  if (started) return
  started = true
  setProgress(Math.max(progress, 5))

  const totalWeight = BOOT_ENDPOINTS.reduce((s, e) => s + e.weight, 0)
  let earned = 0

  const bump = (w: number) => {
    earned += w
    setProgress((earned / totalWeight) * 92)
  }

  void (async () => {
    await Promise.all(
      BOOT_ENDPOINTS.map(async (ep) => {
        try {
          const res = await fetch(ep.url)
          if (res.ok) {
            const json = await res.json()
            if (ep.key === 'districts') {
              districtGeo = json
            }
          }
        } catch {
          /* count step anyway */
        } finally {
          bump(ep.weight)
        }
      })
    )

    dataReady = true
    tryComplete()
  })()

  window.setTimeout(() => {
    dataReady = true
    mapReady = true
    tryComplete()
  }, 25000)
}

/**
 * After a fresh login: clear the "already done" skip flag.
 * Does NOT interrupt an in-flight bootstrap (avoids restarting 0→100 mid-load).
 */
export function resetDashboardBootForLogin() {
  try {
    sessionStorage.removeItem('nigheban:boot-done')
  } catch {
    /* ignore */
  }

  if (!done) return

  done = false
  started = false
  dataReady = false
  mapReady = false
  districtGeo = null
  progress = 0
  emit()
}
