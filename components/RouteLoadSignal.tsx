'use client'

import { useEffect } from 'react'
import { beginRouteLoad, markRouteLoadReady } from '@/lib/route-load-overlay'
import { isDashboardBootDone } from '@/lib/dashboard-bootstrap'

function postBootNavigations() {
  if (isDashboardBootDone()) return true
  try {
    return sessionStorage.getItem('nigheban:boot-done') === '1'
  } catch {
    return false
  }
}

/**
 * Route `loading.tsx` helper: after the first dashboard boot, drive the
 * layout overlay so every tab change plays a full adaptive 0→100.
 * During first boot, BootGate owns the loader — we only keep a black shell.
 */
export default function RouteLoadSignal() {
  useEffect(() => {
    if (!postBootNavigations()) return
    beginRouteLoad()
    return () => markRouteLoadReady()
  }, [])

  return <div className="fixed inset-0 z-[200] bg-black" aria-hidden />
}
