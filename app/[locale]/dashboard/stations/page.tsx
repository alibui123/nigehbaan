import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import StationHealthMapClient from './StationHealthMapClient'
import StationHealthRollup from './StationHealthRollup'
import StationHealthClient from './StationHealthClient'
import type { StationHealthRow } from '@/lib/station-health'
import { enrichDistrictNameUr } from '@/lib/localized'

export default async function StationHealthPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const t = await getTranslations('Stations')
  const tc = await getTranslations('Common')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/login`)

  const [{ data: healthRows }, { data: stationMeta }, { data: tickets }] = await Promise.all([
    supabase
      .from('station_health')
      .select(
        'station_id, name, kind, status, battery_voltage, last_transmission_at, rssi'
      )
      .order('name'),
    supabase
      .from('station')
      .select('id, valley, district_id, source, is_simulated, district:district_id(name_en, name_ur)'),
    supabase
      .from('maintenance_ticket')
      .select('id, station_id, reason, status, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const metaById = new Map(
    (stationMeta ?? []).map((s) => {
      const district = s.district as { name_en: string; name_ur: string | null } | null
      return [
        s.id,
        {
          valley: s.valley as string | null,
          district_id: s.district_id as string | null,
          district_name: district?.name_en ?? null,
          district_name_ur: enrichDistrictNameUr(district?.name_en, district?.name_ur),
          source: s.source as string,
          is_simulated: s.is_simulated as boolean,
        },
      ]
    })
  )

  const stationRows: StationHealthRow[] = (healthRows ?? []).map((h) => {
    const meta = metaById.get(h.station_id)
    return {
      station_id: h.station_id,
      name: h.name,
      kind: h.kind,
      status: h.status as StationHealthRow['status'],
      battery_voltage: h.battery_voltage,
      last_transmission_at: h.last_transmission_at,
      rssi: h.rssi,
      valley: meta?.valley ?? null,
      district_id: meta?.district_id ?? null,
      district_name: meta?.district_name ?? null,
      district_name_ur: meta?.district_name_ur ?? null,
      source: meta?.source ?? 'unknown',
      is_simulated: meta?.is_simulated ?? false,
    }
  })
  const stationNameById = new Map(stationRows.map((s) => [s.station_id, s.name]))

  const ticketsWithNames = (tickets ?? []).map((ticket) => ({
    ...ticket,
    station_name: ticket.station_id ? stationNameById.get(ticket.station_id) : undefined,
  }))

  const openTicketCount = ticketsWithNames.filter((ticket) => ticket.status === 'open').length

  return (
    <div className="min-h-screen bg-[var(--color-base)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-primary)] px-6 py-4">
        <Link href={`/${locale}/dashboard`} className="text-sm text-white/70 hover:text-white">
          {tc('backToOverview')}
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-white">{t('title')}</h1>
        <p className="text-sm text-white/70">
          {t('subtitle')}
        </p>
      </header>

      <div className="space-y-6 p-6">
        <StationHealthRollup stations={stationRows} openTicketCount={openTicketCount} />

        <div className="h-[420px] overflow-hidden rounded-lg border border-[var(--color-border)]">
          <StationHealthMapClient />
        </div>

        <StationHealthClient stations={stationRows} tickets={ticketsWithNames} />
      </div>
    </div>
  )
}
