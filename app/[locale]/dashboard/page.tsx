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
import DashboardBootGate from '@/components/DashboardBootGate'

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ boot?: string }>
}) {
  const { locale } = await params
  const { boot } = await searchParams
  const freshLogin = boot === '1'
  const t = await getTranslations('Dashboard')
  const tc = await getTranslations('Common')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

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
  const popAffected =
    issuedAlerts?.reduce(
      (sum: number, a: { district?: { population?: number } | null }) =>
        sum + (a.district?.population || 0),
      0
    ) || 0

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
    <DashboardBootGate freshLogin={freshLogin}>
    <div className="flex h-dvh flex-col bg-[var(--color-base)]">
      <ReplayChrome />

      {/* Mobile header — hamburger + brand + language. Desktop keeps fuller chrome. */}
      <header className="relative z-[40] border-b border-[var(--color-border)] bg-[var(--color-primary)]">
        <div className="flex items-center justify-between gap-2 px-3 py-2 md:px-6 md:py-3">
          <div className="flex min-w-0 items-center gap-2 md:gap-3">
            {/* Hamburger first on mobile for thumb reach from the start edge */}
            <NavMenu
              locale={locale}
              isOps={isOps}
              role={role}
              districtId={profile?.district_id}
              userLabel={profile?.full_name ?? user.email}
            />
            <div className="flex min-w-0 items-center gap-2 md:gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
                <span className="font-mono text-sm font-semibold text-[var(--color-primary)]">N</span>
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold tracking-tight text-white md:text-base">
                  {tc('brand')}
                </h1>
                <p className="hidden truncate text-xs text-white/70 md:block">{t('provincialOverview')}</p>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 md:gap-4">
            <LanguageToggle currentLocale={locale} variant="header" />
            <span className="hidden items-center text-sm text-white/90 md:inline-flex">
              {profile?.full_name ?? user.email}
              <span className="ms-2 rounded-full bg-white/15 px-2 py-0.5 font-mono text-xs uppercase">
                {profile?.role ?? 'viewer'}
              </span>
            </span>
            {/* Live pulse — mobile only status cue */}
            <span
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-1 md:hidden"
              title={t('liveStatus')}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  activeWarnings > 0 ? 'animate-pulse bg-[var(--color-emergency)]' : 'bg-emerald-400'
                }`}
              />
              <span className="font-mono text-[10px] uppercase text-white/90">
                {activeWarnings > 0 ? t('kpiShortWarnings') : t('liveOk')}
              </span>
            </span>
          </div>
        </div>
      </header>

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

      {/* Feeds strip: room for map on phones; show from sm+ */}
      <div className="hidden sm:block">
        <SourceHealthFooter />
      </div>

      <div className="relative flex flex-1 overflow-hidden pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] md:pb-0">
        <div className="relative flex-1">
          <DashboardMap />
        </div>
        <HazardConsoleSidebar
          hazardsPanel={<HazardEventsFeed />}
          advisoriesPanel={<AdvisoriesFeed />}
        />
      </div>
    </div>
    </DashboardBootGate>
  )
}
