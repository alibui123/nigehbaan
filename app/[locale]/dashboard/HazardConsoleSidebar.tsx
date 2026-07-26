'use client'

import { useEffect, useState } from 'react'
import { useReplay } from '@/lib/replay/ReplayContext'
import ReplayHazardPanel from '@/lib/replay/ReplayHazardPanel'
import { useTranslations } from 'next-intl'

interface HazardConsoleSidebarProps {
  hazardsPanel: React.ReactNode
  advisoriesPanel: React.ReactNode
}

const COLLAPSE_STORAGE_KEY = 'nigheban:hazardSidebarCollapsed'

export default function HazardConsoleSidebar({
  hazardsPanel,
  advisoriesPanel,
}: HazardConsoleSidebarProps) {
  const [tab, setTab] = useState<'hazards' | 'advisories'>('hazards')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileExpanded, setMobileExpanded] = useState(false)
  const t = useTranslations('Dashboard')
  const { isReplaying } = useReplay()

  // Restore collapsed/expanded state across full navigations (desktop only —
  // the collapse control itself is hidden below md, so mobile always renders expanded).
  useEffect(() => {
    if (window.matchMedia('(min-width: 768px)').matches) {
      const stored = window.localStorage.getItem(COLLAPSE_STORAGE_KEY)
      if (stored === 'true') setCollapsed(true)
    }
  }, [])

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next))
      return next
    })
  }

  // Shared tab switcher + content — reused by both the desktop sidebar and
  // the mobile sheet below, so hazards/advisories logic (including the
  // replay-mode swap) only lives in one place.
  const activePanel = tab === 'hazards' ? (isReplaying ? <ReplayHazardPanel /> : hazardsPanel) : advisoriesPanel

  return (
    <>
      {/* ---------- Desktop side panel ---------- */}
      {/* Toggle stays in normal flow so it remains fully on-screen when the panel width is 0. */}
      <div className="relative hidden h-full shrink-0 md:flex">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-controls="hazard-console-sidebar"
          aria-label={collapsed ? t('expandSidebar') : t('collapseSidebar')}
          className={`z-20 my-auto flex h-12 w-6 shrink-0 items-center justify-center border border-black bg-black text-white shadow-sm transition-colors hover:bg-neutral-900 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
            collapsed
              ? 'rounded-md border-e'
              : 'rounded-s-md border-e-0'
          }`}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={`transition-transform duration-300 rtl:-scale-x-100 ${
              collapsed ? 'rotate-180' : ''
            }`}
          >
            {/* Panel rail + chevron — standard collapse control */}
            <rect x="3" y="4" width="5" height="16" rx="1" />
            <path d="M16 8l-4 4 4 4" />
          </svg>
        </button>

        <div
          id="hazard-console-sidebar"
          className={`h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out ${
            collapsed ? 'w-0' : 'w-80'
          }`}
        >
          <div className="flex h-full w-80 flex-col border-s border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="flex border-b border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setTab('hazards')}
                className={`flex-1 px-4 py-3 text-xs font-semibold uppercase tracking-wide transition-colors ${
                  tab === 'hazards'
                    ? 'border-b-2 border-[var(--color-emergency)] text-[var(--color-ink)]'
                    : 'text-[var(--color-ink)]/50 hover:text-[var(--color-ink)]/70'
                }`}
              >
                {t('activeHazardsTab')}
              </button>
              <button
                type="button"
                onClick={() => setTab('advisories')}
                className={`flex-1 px-4 py-3 text-xs font-semibold uppercase tracking-wide transition-colors ${
                  tab === 'advisories'
                    ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-ink)]'
                    : 'text-[var(--color-ink)]/50 hover:text-[var(--color-ink)]/70'
                }`}
              >
                {t('advisoriesTab')}
              </button>
            </div>

            {activePanel}
          </div>
        </div>
      </div>

      {/* ---------- Mobile bottom sheet (sits above MobileBottomNav h-14) ---------- */}
      <div
        className={`fixed inset-0 z-30 bg-[var(--color-ink)]/30 transition-opacity duration-200 md:hidden ${
          mobileExpanded ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setMobileExpanded(false)}
        aria-hidden="true"
      />
      <div
        className={`fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] z-40 flex flex-col overflow-hidden rounded-t-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_-10px_36px_rgba(20,35,26,0.14)] transition-[height] duration-300 ease-in-out md:hidden ${
          mobileExpanded ? 'h-[min(72vh,640px)]' : 'h-12'
        }`}
      >
        <button
          type="button"
          onClick={() => setMobileExpanded((prev) => !prev)}
          aria-expanded={mobileExpanded}
          aria-controls="hazard-console-sheet-content"
          className="flex h-12 shrink-0 items-center justify-between gap-3 px-4"
        >
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-emergency)]" aria-hidden="true" />
            <span className="text-xs font-semibold text-[var(--color-ink)]">
              {tab === 'hazards' ? t('activeHazardsTab') : t('advisoriesTab')}
            </span>
          </span>
          <span className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-[var(--color-ink)]/45">
            {mobileExpanded ? t('sheetClose') : t('sheetOpen')}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={`transition-transform duration-300 ${mobileExpanded ? 'rotate-180' : ''}`}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </button>

        <div
          id="hazard-console-sheet-content"
          inert={!mobileExpanded}
          className="flex flex-1 flex-col overflow-hidden border-t border-[var(--color-border)]"
        >
          <div className="flex shrink-0 gap-1 bg-[var(--color-base)] p-1.5">
            <button
              type="button"
              onClick={() => setTab('hazards')}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                tab === 'hazards'
                  ? 'bg-[var(--color-surface)] text-[var(--color-emergency)] shadow-sm'
                  : 'text-[var(--color-ink)]/50'
              }`}
            >
              {t('activeHazardsTab')}
            </button>
            <button
              type="button"
              onClick={() => setTab('advisories')}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                tab === 'advisories'
                  ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-sm'
                  : 'text-[var(--color-ink)]/50'
              }`}
            >
              {t('advisoriesTab')}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {activePanel}
          </div>
        </div>
      </div>
    </>
  )
}
