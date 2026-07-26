'use client'

import { useReplay } from './ReplayContext'
import { getReplayKpis } from './adapters'
import { useTranslations } from 'next-intl'

interface LiveKpis {
  activeWarnings: number
  districtsAffected: number | string
  districtCount: number
  popAffected: number | string
  deliveryRate: string
  deliveryDetail: string
}

/**
 * Desktop: 4-column grid (unchanged).
 * Mobile: compact horizontal chip strip so the map keeps most of the screen.
 */
export default function ReplayKpiStrip({ live }: { live: LiveKpis }) {
  const { isReplaying, currentFrame } = useReplay()
  const t = useTranslations('Dashboard')
  const replay = getReplayKpis(currentFrame)

  const kpis = isReplaying && replay
    ? replay
    : {
        activeWarnings: live.activeWarnings,
        districtsAffected: live.districtsAffected,
        populationAffected:
          typeof live.popAffected === 'number' && live.popAffected > 0
            ? live.popAffected.toLocaleString()
            : '—',
        deliveryRate: live.deliveryRate,
        deliveryDetail: live.deliveryDetail,
      }

  const stripBg = isReplaying ? 'bg-amber-50' : 'bg-[var(--color-surface)]'
  const warningHot =
    typeof kpis.activeWarnings === 'number' ? kpis.activeWarnings > 0 : kpis.activeWarnings !== 0

  const items = [
    {
      key: 'warnings',
      label: t('activeWarnings'),
      short: t('kpiShortWarnings'),
      value: kpis.activeWarnings,
      valueClass: warningHot ? 'text-[var(--color-emergency)]' : 'text-[var(--color-ink)]',
      detail: null as string | null,
    },
    {
      key: 'districts',
      label: t('districtsAffected'),
      short: t('kpiShortDistricts'),
      value: kpis.districtsAffected,
      valueClass: 'text-[var(--color-ink)]',
      detail: !isReplaying ? t('monitored', { count: live.districtCount }) : null,
    },
    {
      key: 'population',
      label: t('populationAffected'),
      short: t('kpiShortPopulation'),
      value: kpis.populationAffected,
      valueClass: 'text-[var(--color-ink)]',
      detail: null,
    },
    {
      key: 'delivery',
      label: t('deliverySuccessRate'),
      short: t('kpiShortDelivery'),
      value: kpis.deliveryRate,
      valueClass: 'text-[var(--color-ink)]',
      detail: kpis.deliveryDetail || null,
    },
  ]

  return (
    <>
      {/* Mobile — single glance row */}
      <div
        className={`flex gap-2 overflow-x-auto border-b border-[var(--color-border)] px-3 py-2 [-ms-overflow-style:none] [scrollbar-width:none] md:hidden ${stripBg} [&::-webkit-scrollbar]:hidden`}
      >
        {items.map((item) => (
          <div
            key={item.key}
            className={`flex shrink-0 items-baseline gap-1.5 rounded-full border px-3 py-1.5 ${
              item.key === 'warnings' && warningHot
                ? 'border-[var(--color-emergency)]/25 bg-[var(--color-emergency)]/8'
                : 'border-[var(--color-border)] bg-[var(--color-base)]'
            }`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink)]/45">
              {item.short}
            </span>
            <span className={`font-mono text-sm font-semibold ${item.valueClass}`}>{item.value}</span>
          </div>
        ))}
      </div>

      {/* Desktop — original 4-col grid */}
      <div
        className={`hidden gap-px border-b border-[var(--color-border)] bg-[var(--color-border)] md:grid md:grid-cols-4 ${stripBg}`}
      >
        {items.map((item) => (
          <div key={item.key} className={`px-5 py-3.5 ${stripBg}`}>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink)]/50">
              {item.label}
            </p>
            <p className={`mt-1 font-mono text-2xl font-semibold ${item.valueClass}`}>
              {item.value}
              {item.key === 'delivery' && item.detail && (
                <span className="ms-2 text-xs font-medium text-[var(--color-ink)]/50">{item.detail}</span>
              )}
            </p>
            {item.key !== 'delivery' && item.detail && (
              <p className="mt-0.5 text-xs text-[var(--color-ink)]/40">{item.detail}</p>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
