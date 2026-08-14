'use client'

import { useState, useRef, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { beginRouteLoad } from '@/lib/route-load-overlay'
import { isDashboardBootDone } from '@/lib/dashboard-bootstrap'
import LogoutButton from '@/components/LogoutButton'

type NavMenuProps = {
  locale: string
  isOps: boolean
  role?: string
  districtId?: string | null
  userLabel?: string | null
}

type NavTone = 'default' | 'alert' | 'amber'

type NavItem = {
  href: string
  label: string
  active: boolean
  tone?: NavTone
  icon: ReactNode
}

function IconMap() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20V6.5Z" strokeLinejoin="round" />
      <path d="M9 4v13.5M15 6.5V20" strokeLinecap="round" />
    </svg>
  )
}

function IconAlert() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 3 2.5 20h19L12 3Z" strokeLinejoin="round" />
      <path d="M12 10v4.5M12 17.5h.01" strokeLinecap="round" />
    </svg>
  )
}

function IconStations() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" strokeLinecap="round" />
    </svg>
  )
}

function IconDistrict() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 20V9l8-5 8 5v11" strokeLinejoin="round" />
      <path d="M9 20v-6h6v6" strokeLinejoin="round" />
    </svg>
  )
}

function IconReplay() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 12a8 8 0 1 0 2.3-5.7" strokeLinecap="round" />
      <path d="M4 5v4h4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 9.5 16 12l-6 2.5v-5Z" strokeLinejoin="round" />
    </svg>
  )
}

function IconAudit() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M8 4h8a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 0 1 2-2Z" strokeLinejoin="round" />
      <path d="M9 9h6M9 13h6M9 17h3" strokeLinecap="round" />
    </svg>
  )
}

function shouldAnimateRouteLoad() {
  if (isDashboardBootDone()) return true
  try {
    return sessionStorage.getItem('nigheban:boot-done') === '1'
  } catch {
    return false
  }
}

function onNavNavigate(e: React.MouseEvent<HTMLAnchorElement>, alreadyActive: boolean) {
  if (alreadyActive) return
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
  if (!shouldAnimateRouteLoad()) return
  beginRouteLoad()
}

/**
 * Hamburger navigation.
 * Mobile: slide-over drawer.
 * Desktop (md+): ops command panel under the trigger.
 */
export default function NavMenu({ locale, isOps, role, districtId, userLabel }: NavMenuProps) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const t = useTranslations('Dashboard')
  const pathname = usePathname()
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (window.matchMedia('(min-width: 768px)').matches) {
        if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
          setOpen(false)
        }
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const base = `/${locale}/dashboard`
  const alertsHref = `${base}/alerts`
  const showAlerts = isOps || role === 'district_focal'

  const onMap = pathname === base || pathname === `${base}/`
  const onAlerts = pathname.startsWith(`${base}/alerts`)
  const onStations = pathname.startsWith(`${base}/stations`)
  const onAudit = pathname.startsWith(`${base}/audit`)
  const onReplay = pathname.startsWith(`${base}/replay`)
  const onDistrict = pathname.startsWith(`${base}/district`)

  const items: NavItem[] = [
    { href: base, label: t('navMap'), active: onMap, icon: <IconMap /> },
    ...(showAlerts
      ? [
          {
            href: alertsHref,
            label: role === 'district_focal' ? t('districtAlerts') : t('reviewAlerts'),
            active: onAlerts,
            tone: 'alert' as const,
            icon: <IconAlert />,
          },
        ]
      : []),
    ...(isOps
      ? [
          {
            href: `${base}/stations`,
            label: t('stationHealthLink'),
            active: onStations,
            icon: <IconStations />,
          },
        ]
      : []),
    ...(role === 'district_focal' && districtId
      ? [
          {
            href: `${base}/district/${districtId}`,
            label: t('myDistrictConsole'),
            active: onDistrict,
            tone: 'amber' as const,
            icon: <IconDistrict />,
          },
        ]
      : []),
    ...(isOps
      ? [
          {
            href: `${base}/replay`,
            label: t('replayMode'),
            active: onReplay,
            tone: 'amber' as const,
            icon: <IconReplay />,
          },
          {
            href: `${base}/audit`,
            label: t('auditLogLink'),
            active: onAudit,
            icon: <IconAudit />,
          },
        ]
      : []),
  ]

  function mobileItemClass(active: boolean, tone: NavTone = 'default') {
    if (active) return 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
    if (tone === 'alert') return 'text-[var(--color-emergency)]'
    if (tone === 'amber') return 'text-amber-800'
    return 'text-[var(--color-ink)]'
  }

  function desktopItemClass(active: boolean, tone: NavTone = 'default') {
    if (active) {
      return 'bg-[var(--color-primary)]/[0.08] text-[var(--color-primary)] shadow-[inset_3px_0_0_0_var(--color-primary)]'
    }
    if (tone === 'alert') return 'text-[var(--color-emergency)] hover:bg-red-50'
    if (tone === 'amber') return 'text-amber-800 hover:bg-amber-50'
    return 'text-[var(--color-ink)]/85 hover:bg-[var(--color-base)] hover:text-[var(--color-ink)]'
  }

  const roleLabel = role?.replaceAll('_', ' ') ?? 'viewer'

  const mobileDrawer =
    mounted &&
    createPortal(
      <div
        className={`fixed inset-0 z-[80] md:hidden ${open ? '' : 'pointer-events-none'}`}
        aria-hidden={!open}
      >
        <div
          className={`absolute inset-0 bg-[var(--color-ink)]/45 transition-opacity duration-200 ${
            open ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => setOpen(false)}
        />
        <div
          id="nav-menu-panel"
          role="menu"
          inert={!open}
          className={`absolute inset-y-0 start-0 flex w-[min(20rem,86vw)] flex-col bg-[var(--color-surface)] shadow-[8px_0_40px_rgba(20,35,26,0.2)] transition-transform duration-300 ease-out ${
            open ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full'
          }`}
        >
          <div className="border-b border-[var(--color-border)] bg-[var(--color-primary)] px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white">
                <span className="font-mono text-sm font-semibold text-[var(--color-primary)]">N</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">Nigheban</p>
                <p className="truncate font-mono text-[10px] uppercase tracking-wide text-white/70">
                  {roleLabel}
                  {userLabel ? ` · ${userLabel}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('closeNav')}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink)]/40">
              {t('navMenu')}
            </p>
            {items.map((item) => (
              <a
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={(e) => {
                  onNavNavigate(e, item.active)
                  setOpen(false)
                }}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold active:bg-[var(--color-base)] ${mobileItemClass(item.active, item.tone)}`}
              >
                <span className="opacity-80">{item.icon}</span>
                <span className="truncate">{item.label.replace(/\s*→\s*$/, '')}</span>
              </a>
            ))}
          </nav>

          <div className="border-t border-[var(--color-border)] p-3 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-2">
            <LogoutButton locale={locale} variant="drawer" onSignOut={() => setOpen(false)} />
            <p className="px-1 text-[11px] leading-relaxed text-[var(--color-ink)]/45">{t('provincialOverview')}</p>
          </div>
        </div>
      </div>,
      document.body
    )

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('openNav')}
        aria-expanded={open}
        aria-controls={open ? 'nav-menu-panel nav-menu-panel-desktop' : undefined}
        className={`group flex h-10 items-center gap-2 rounded-xl px-2.5 text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 md:h-9 md:rounded-lg md:px-2.5 ${
          open ? 'bg-white/20' : 'bg-white/10 hover:bg-white/15 active:bg-white/20'
        }`}
      >
        <span className="relative flex h-4 w-5 flex-col justify-between" aria-hidden>
          <span
            className={`block h-0.5 w-full origin-center rounded-full bg-white transition-transform duration-200 ${
              open ? 'translate-y-[7px] rotate-45' : ''
            }`}
          />
          <span
            className={`block h-0.5 w-full rounded-full bg-white transition-all duration-200 ${
              open ? 'w-0 opacity-0' : 'w-3.5 group-hover:w-full'
            }`}
          />
          <span
            className={`block h-0.5 w-full origin-center rounded-full bg-white transition-transform duration-200 ${
              open ? '-translate-y-[7px] -rotate-45' : ''
            }`}
          />
        </span>
        <span className="hidden font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-white/85 md:inline">
          {t('navMenu')}
        </span>
      </button>

      {/* Desktop command panel */}
      <div
        id="nav-menu-panel-desktop"
        role="menu"
        inert={!open}
        className={`absolute start-0 top-11 z-50 hidden w-[18.5rem] origin-top-left overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_16px_40px_-12px_rgba(20,35,26,0.35)] transition-all duration-200 ease-out md:block rtl:origin-top-right ${
          open
            ? 'translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none -translate-y-1.5 scale-[0.98] opacity-0'
        }`}
      >
        <div className="relative border-b border-[var(--color-border)] bg-[var(--color-base)] px-3.5 py-3">
          <div className="absolute inset-y-0 start-0 w-1 bg-[var(--color-primary)]" aria-hidden />
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink)]/45">
            {t('navMenu')}
          </p>
          <div className="mt-1.5 flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-semibold text-[var(--color-ink)]">
              {userLabel ?? 'Nigheban'}
            </p>
            <span className="shrink-0 rounded-md bg-[var(--color-primary)]/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-[var(--color-primary)]">
              {roleLabel}
            </span>
          </div>
        </div>

        <nav className="p-1.5">
          {items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={(e) => {
                onNavNavigate(e, item.active)
                setOpen(false)
              }}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${desktopItemClass(item.active, item.tone)}`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                  item.active
                    ? 'bg-[var(--color-primary)] text-white'
                    : item.tone === 'alert'
                      ? 'bg-red-50 text-[var(--color-emergency)]'
                      : item.tone === 'amber'
                        ? 'bg-amber-50 text-amber-800'
                        : 'bg-[var(--color-base)] text-[var(--color-ink)]/55'
                }`}
              >
                {item.icon}
              </span>
              <span className="min-w-0 flex-1 truncate">{item.label.replace(/\s*→\s*$/, '')}</span>
              {item.active && (
                <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-primary)]/70">
                  ●
                </span>
              )}
            </a>
          ))}
          <div className="my-1 border-t border-[var(--color-border)]/60" />
          <LogoutButton locale={locale} variant="menu" onSignOut={() => setOpen(false)} />
        </nav>

        <div className="border-t border-[var(--color-border)] bg-[var(--color-base)]/60 px-3.5 py-2.5">
          <p className="text-[11px] leading-snug text-[var(--color-ink)]/45">{t('provincialOverview')}</p>
        </div>
      </div>

      {mobileDrawer}
    </div>
  )
}
