'use client'

import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { beginRouteLoad } from '@/lib/route-load-overlay'
import { isDashboardBootDone } from '@/lib/dashboard-bootstrap'

type MobileBottomNavProps = {
  locale: string
  isOps: boolean
  role?: string
}

function MapIcon({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2' : '1.7'}>
      <path d="M9 20l-6-3V4l6 3 6-3 6 3v13l-6-3-6 3z" strokeLinejoin="round" />
      <path d="M9 7v13M15 4v13" />
    </svg>
  )
}
function AlertIcon({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2' : '1.7'}>
      <path d="M12 3l10 18H2L12 3z" strokeLinejoin="round" />
      <path d="M12 10v4" strokeLinecap="round" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}
function StationIcon({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2' : '1.7'}>
      <path d="M12 2v6M8 5a5 5 0 018 0M5.5 3a9 9 0 0113 0" strokeLinecap="round" />
      <circle cx="12" cy="14" r="2.2" />
      <path d="M12 16v6" strokeLinecap="round" />
    </svg>
  )
}

function tabClass(active: boolean) {
  return [
    'relative flex flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1 transition-colors',
    active ? 'text-[var(--color-primary)]' : 'text-[var(--color-ink)]/45 active:text-[var(--color-ink)]/70',
  ].join(' ')
}

function shouldAnimateRouteLoad() {
  if (isDashboardBootDone()) return true
  try {
    return sessionStorage.getItem('nigheban:boot-done') === '1'
  } catch {
    return false
  }
}

function onTabNavigate(e: React.MouseEvent<HTMLAnchorElement>, alreadyActive: boolean) {
  if (alreadyActive) return
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
  if (!shouldAnimateRouteLoad()) return
  beginRouteLoad()
}

/** Mobile tab bar — Map / Alerts / Stations. Extra links live in the header hamburger. */
export default function MobileBottomNav({ locale, isOps, role }: MobileBottomNavProps) {
  const pathname = usePathname()
  const t = useTranslations('Dashboard')

  const base = `/${locale}/dashboard`
  const alertsHref = `${base}/alerts`
  const showAlertsTab = isOps || role === 'district_focal'

  const onMap = pathname === base || pathname === `${base}/`
  const onAlerts = pathname.startsWith(`${base}/alerts`)
  const onStations = pathname.startsWith(`${base}/stations`)

  return (
    <nav
      aria-label={t('openNav')}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_24px_rgba(20,35,26,0.08)] backdrop-blur-xl md:hidden"
    >
      <div className="flex h-14 items-stretch">
        <a
          href={base}
          onClick={(e) => onTabNavigate(e, onMap)}
          className={tabClass(onMap)}
          aria-current={onMap ? 'page' : undefined}
        >
          {onMap && <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-[var(--color-primary)]" />}
          <MapIcon active={onMap} />
          <span className="text-[10px] font-semibold tracking-wide">{t('navMap')}</span>
        </a>

        {showAlertsTab && (
          <a
            href={alertsHref}
            onClick={(e) => onTabNavigate(e, onAlerts)}
            className={tabClass(onAlerts)}
            aria-current={onAlerts ? 'page' : undefined}
          >
            {onAlerts && <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-[var(--color-primary)]" />}
            <AlertIcon active={onAlerts} />
            <span className="text-[10px] font-semibold tracking-wide">{t('alerts')}</span>
          </a>
        )}

        {isOps && (
          <a
            href={`${base}/stations`}
            onClick={(e) => onTabNavigate(e, onStations)}
            className={tabClass(onStations)}
            aria-current={onStations ? 'page' : undefined}
          >
            {onStations && <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-[var(--color-primary)]" />}
            <StationIcon active={onStations} />
            <span className="text-[10px] font-semibold tracking-wide">{t('navStations')}</span>
          </a>
        )}
      </div>
    </nav>
  )
}
