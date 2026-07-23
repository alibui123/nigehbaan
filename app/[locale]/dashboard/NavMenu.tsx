'use client'

import { useState, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'

type NavMenuProps = {
  locale: string
  isOps: boolean
  role?: string
  districtId?: string | null
}

export default function NavMenu({ locale, isOps, role, districtId }: NavMenuProps) {
  const [open, setOpen] = useState(false)
  const t = useTranslations('Dashboard')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        aria-label={t('openNav')}
        aria-expanded={open}
        className="flex h-9 w-9 flex-col items-center justify-center gap-1.5 rounded-md hover:bg-white/10"
      >
        <span className="h-0.5 w-5 bg-white" />
        <span className="h-0.5 w-5 bg-white" />
        <span className="h-0.5 w-5 bg-white" />
      </button>

      {open && (
        <div className="absolute end-0 top-11 z-50 w-56 rounded-md border border-[var(--color-border)] bg-[var(--color-primary)] py-2 shadow-lg">
          {role === 'district_focal' && districtId && (
            <a
              href={`/${locale}/dashboard/district/${districtId}`}
              className="block px-4 py-2 text-sm font-medium text-amber-200 hover:bg-white/10 hover:text-white"
            >
              {t('myDistrictConsole')}
            </a>
          )}
          {isOps && (
            <a
              href={`/${locale}/dashboard/replay`}
              className="block px-4 py-2 text-sm text-amber-200 hover:bg-white/10 hover:text-white"
            >
              {t('replayMode')}
            </a>
          )}
          {isOps && (
            <a
              href={`/${locale}/dashboard/audit`}
              className="block px-4 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
            >
              {t('auditLogLink')}
            </a>
          )}
          {(isOps || role === 'district_focal') && (
            <a
              href={`/${locale}/dashboard/alerts`}
              className="block px-4 py-2 text-sm font-medium text-red-300 hover:bg-white/10 hover:text-red-200"
            >
              {role === 'district_focal' ? t('districtAlerts') : t('reviewAlerts')}
            </a>
          )}
          {isOps && (
            <a
              href={`/${locale}/dashboard/stations`}
              className="block px-4 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
            >
              {t('stationHealthLink')}
            </a>
          )}
        </div>
      )}
    </div>
  )
}