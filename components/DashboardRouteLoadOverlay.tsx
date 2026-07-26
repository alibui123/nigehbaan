'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import AdaptiveMapLoader from '@/components/AdaptiveMapLoader'
import {
  dismissRouteLoad,
  getRouteLoadState,
  markRouteLoadReady,
  subscribeRouteLoad,
} from '@/lib/route-load-overlay'

/**
 * Lives in the dashboard layout so the map loader can finish 0→100 after
 * Next.js has already unmounted the route `loading.tsx`.
 */
export default function DashboardRouteLoadOverlay() {
  const state = useSyncExternalStore(subscribeRouteLoad, getRouteLoadState, getRouteLoadState)
  const pathname = usePathname()
  const pathAtStart = useRef(pathname)
  const [session, setSession] = useState<{ id: number; ready: boolean } | null>(null)

  useEffect(() => {
    if (!state.visible) return
    setSession((prev) => {
      if (prev?.id === state.id && prev.ready === state.contentReady) return prev
      if (!prev || prev.id !== state.id) {
        pathAtStart.current = pathname
      }
      return { id: state.id, ready: state.contentReady }
    })
  }, [state.visible, state.id, state.contentReady, pathname])

  // When the URL actually changes, the destination page is ready — finish the fill.
  useEffect(() => {
    if (!state.visible || state.contentReady) return
    if (pathname === pathAtStart.current) return
    markRouteLoadReady()
  }, [pathname, state.visible, state.contentReady])

  const onFinished = useCallback((id: number) => {
    setSession(null)
    // Defer store update so we don't sync-rerender this component during setState.
    queueMicrotask(() => dismissRouteLoad(id))
  }, [])

  if (!session) return null

  return (
    <AdaptiveMapLoader
      key={session.id}
      ready={session.ready}
      onFinished={() => onFinished(session.id)}
    />
  )
}
