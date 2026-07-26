'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { usePathname } from 'next/navigation'
import AdaptiveMapLoader from '@/components/AdaptiveMapLoader'
import {
  isDashboardBootDone,
  markDashboardMapReady,
  resetDashboardBootForLogin,
  startDashboardBootstrap,
  subscribeDashboardBoot,
} from '@/lib/dashboard-bootstrap'

type BootContextValue = {
  setBootProgress: (value: number) => void
  completeBoot: () => void
  markMapReady: () => void
  isBooting: boolean
}

const BootContext = createContext<BootContextValue | null>(null)

export function useDashboardBoot() {
  const ctx = useContext(BootContext)
  if (!ctx) {
    return {
      setBootProgress: () => {},
      completeBoot: () => {},
      markMapReady: () => {},
      isBooting: false,
    }
  }
  return ctx
}

type DashboardBootGateProps = {
  children: ReactNode
  /** From the server (`?boot=1` after login) — must not be read via useSearchParams (Suspense/hydration). */
  freshLogin?: boolean
}

/**
 * Full-screen Pakistan map gate after login.
 * `ready` initial state is derived only from the SSR `freshLogin` prop so
 * server HTML and the first client render always match.
 */
export default function DashboardBootGate({
  children,
  freshLogin = false,
}: DashboardBootGateProps) {
  const pathname = usePathname()

  // SSR-safe: never read sessionStorage during useState init.
  const [ready, setReady] = useState(!freshLogin)
  const [dataReady, setDataReady] = useState(() => (!freshLogin ? isDashboardBootDone() : false))

  useEffect(() => {
    if (!freshLogin) return

    resetDashboardBootForLogin()
    setReady(false)
    setDataReady(false)
    startDashboardBootstrap()

    // Strip ?boot=1 without a Next soft-navigation (avoids remounting mid-boot).
    window.history.replaceState(null, '', pathname)
  }, [freshLogin, pathname])

  useEffect(() => {
    if (ready) return

    startDashboardBootstrap()

    return subscribeDashboardBoot((_p, isDone) => {
      if (isDone) setDataReady(true)
    })
  }, [ready])

  const markMapReady = useCallback(() => {
    markDashboardMapReady()
  }, [])

  const onFinished = useCallback(() => {
    setReady(true)
  }, [])

  const value = useMemo(
    () => ({
      setBootProgress: () => {},
      completeBoot: markMapReady,
      markMapReady,
      isBooting: !ready,
    }),
    [markMapReady, ready]
  )

  return (
    <BootContext.Provider value={value}>
      {children}
      {!ready && <AdaptiveMapLoader ready={dataReady} onFinished={onFinished} />}
    </BootContext.Provider>
  )
}
