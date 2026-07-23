import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardMap from './DashboardMapLoader'
import SourceHealthFooter from './SourceHealthFooter'
import HazardConsoleSidebar from './HazardConsoleSidebar'
import HazardEventsFeed from './HazardEventsFeed'
import AdvisoriesFeed from './AdvisoriesFeed'
import ReplayKpiStrip from '@/lib/replay/ReplayKpiStrip'
import ReplayChrome from '@/lib/replay/ReplayChrome'
import { isProvincialOps, type AppRole } from '@/lib/alert-workflow'
import NavMenu from './NavMenu'
import LanguageToggle from '../LanguageToggle'
import { getTranslations } from 'next-intl/server'

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const t = await getTranslations('Dashboard')
  const tc = await getTranslations('Common')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }
  // These four queries don't depend on each other's results, so run them
  // concurrently instead of one at a time — this was previously four
  // sequential round trips to Supabase before the page could render at all.
  const today = new Date().toISOString().slice(0, 10)
  const [
    { data: profile },
    { count: districtCount },
    { data: issuedAlerts },
    { count: totalDeliveries },
    { count: deliveredCount },
    { data: floodAffected },
  ] = await Promise.all([
    supabase.from('profile').select('full_name, role, district_id').eq('id', user.id).single(),
    supabase.from('district').select('*', { count: 'exact', head: true }),
    supabase.from('alert_candidate').select('id, district_id, district:district_id(population)').eq('status', 'issued'),
    supabase.from('alert_delivery').select('*', { count: 'exact', head: true }),
    supabase.from('alert_delivery').select('*', { count: 'exact', head: true }).in('status', ['delivered', 'acknowledged']),
    supabase
      .from('flood_forecast')
      .select('district_id')
      .in('risk_level', ['high', 'medium'])
      .gte('forecast_date', today),
  ])

  const activeWarnings = issuedAlerts?.length || 0
  const popAffected = issuedAlerts?.reduce((sum: number, a: { district?: { population?: number } | null }) => sum + (a.district?.population || 0), 0) || 0

  const affectedDistrictIds = new Set<string>()
  issuedAlerts?.forEach((a: { district_id?: string | null }) => {
    if (a.district_id) affectedDistrictIds.add(a.district_id)
  })
  floodAffected?.forEach((f: { district_id: string }) => affectedDistrictIds.add(f.district_id))
  const districtsAffected = affectedDistrictIds.size
  
  const totalDel = totalDeliveries ?? 0
  const delCount = deliveredCount ?? 0
  const deliveryRate = totalDel > 0 ? Math.round((delCount / totalDel) * 100) : 0
  const role = profile?.role as AppRole | undefined
  const isOps = isProvincialOps(role)
  return (
    <div className="flex h-screen flex-col bg-[var(--color-base)]">
      <ReplayChrome />
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-primary)] px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white">
            <span className="font-mono text-sm font-semibold text-[var(--color-primary)]">N</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">{tc('brand')}</h1>
            <p className="text-xs text-white/70">{t('provincialOverview')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <LanguageToggle currentLocale={locale} variant="header" />
          <NavMenu locale={locale} isOps={isOps} role={role} districtId={profile?.district_id} />
          <span className="text-sm text-white/90">
            {profile?.full_name ?? user.email}
            <span className="ms-2 rounded-full bg-white/15 px-2 py-0.5 font-mono text-xs uppercase">
              {profile?.role ?? 'viewer'}
            </span>
          </span>
        </div>
      </header>
      {/* KPI strip */}
      <ReplayKpiStrip
        live={{
          activeWarnings,
          districtsAffected: districtsAffected > 0 ? districtsAffected : '—',
          districtCount: districtCount ?? 0,
          popAffected,
          deliveryRate: totalDel > 0 ? `${deliveryRate}%` : '—',
          deliveryDetail: totalDel > 0 ? `(${delCount}/${totalDel})` : '',
        }}
      />
      {/* Source health strip */}
      <SourceHealthFooter />
      {/* Main content: Map and Sidebar */}
      <div className="relative flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          <DashboardMap />
        </div>
        <HazardConsoleSidebar
          hazardsPanel={<HazardEventsFeed />}
          advisoriesPanel={<AdvisoriesFeed />}
        />
      </div>
    </div>
  )
}