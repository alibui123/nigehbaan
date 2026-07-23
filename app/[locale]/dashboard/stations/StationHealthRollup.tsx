'use client'

import { useLocale } from 'next-intl'
import { groupBreakdown, computeRollup, type StationHealthRow } from '@/lib/station-health'
import { districtDisplayName } from '@/lib/localized'

interface StationHealthRollupProps {
  stations: StationHealthRow[]
  openTicketCount: number
}

export default function StationHealthRollup({ stations, openTicketCount }: StationHealthRollupProps) {
  const locale = useLocale()
  const stats = computeRollup(stations, openTicketCount)
  const byValley = groupBreakdown(stations, (s) => s.valley ?? '—')
  const byDistrict = groupBreakdown(stations, (s) =>
    districtDisplayName(locale, s.district_name, s.district_name_ur)
  )

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
        <p className="font-mono text-sm text-[var(--color-ink)]">
          <span className="font-semibold text-[var(--color-primary-hover)]">
            {stats.reporting}/{stats.total}
          </span>
          {locale === 'ur' ? ' اسٹیشن رپورٹ کر رہے ہیں ' : ' stations reporting '}
          <span className="text-[var(--color-ink)]/60">({stats.reportingPct}%)</span>
          <span className="mx-2 text-[var(--color-ink)]/30">·</span>
          <span className="text-[#E0A030]">
            {stats.lowBattery}{locale === 'ur' ? ' کم بیٹری' : ' low battery'}
          </span>
          <span className="mx-2 text-[var(--color-ink)]/30">·</span>
          <span className="text-[var(--color-emergency)]">
            {stats.offline72h}{locale === 'ur' ? ' آف لائن > 72 گھنٹے' : ' offline > 72h'}
          </span>
          {stats.openTickets > 0 && (
            <>
              <span className="mx-2 text-[var(--color-ink)]/30">·</span>
              <span className="text-[var(--color-emergency)]">
                {stats.openTickets}{locale === 'ur' ? ' کھلے ٹکٹ' : ' open tickets'}
              </span>
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <BreakdownTable
          title={locale === 'ur' ? 'وادی کے لحاظ سے' : 'By Valley'}
          rows={byValley}
          locale={locale}
        />
        <BreakdownTable
          title={locale === 'ur' ? 'ضلع کے لحاظ سے' : 'By District'}
          rows={byDistrict}
          locale={locale}
        />
      </div>
    </section>
  )
}

function BreakdownTable({
  title,
  rows,
  locale,
}: {
  title: string
  rows: { label: string; total: number; reporting: number; offline: number; lowBattery: number }[]
  locale: string
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-base)] px-4 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">
          {title}
        </h2>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-[var(--color-ink)]/40">
          <tr>
            <th className="px-4 py-2">{locale === 'ur' ? 'نام' : 'Name'}</th>
            <th className="px-4 py-2">{locale === 'ur' ? 'رپورٹنگ' : 'Reporting'}</th>
            <th className="px-4 py-2">{locale === 'ur' ? 'آف لائن' : 'Offline'}</th>
            <th className="px-4 py-2">{locale === 'ur' ? 'کم بیٹری' : 'Low batt.'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 12).map((r) => (
            <tr key={r.label} className="border-t border-[var(--color-border)]">
              <td className="px-4 py-2">{r.label}</td>
              <td className="px-4 py-2 font-mono">
                {r.reporting}/{r.total}
              </td>
              <td className="px-4 py-2 font-mono text-[var(--color-emergency)]">{r.offline}</td>
              <td className="px-4 py-2 font-mono text-[#E0A030]">{r.lowBattery}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
