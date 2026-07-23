import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { isProvincialOps, type AppRole } from '@/lib/alert-workflow'
import { getTranslations } from 'next-intl/server'
import {
  dataLabel,
  districtDisplayName,
  localizeAlertFields,
  provinceDisplayName,
} from '@/lib/localized'

const LIST_COLUMNS =
  'id, district_id, title, description, severity, metric_name, observed_value, threshold_value, status, created_at, issued_at, event_en, event_ur, headline_en, headline_ur'

async function dismissCandidate(formData: FormData) {
  'use server'
  const id = formData.get('id') as string
  const locale = (formData.get('locale') as string) || 'en'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase.from('profile').select('role').eq('id', user.id).single()
  if (!isProvincialOps(profile?.role as AppRole)) {
    throw new Error('Only duty officers or DG can dismiss candidates')
  }

  const { error } = await supabase.from('alert_candidate').update({ status: 'dismissed' }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/${locale}/dashboard/alerts`)
}

export default async function AlertsReviewPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const t = await getTranslations('Alerts')
  const tc = await getTranslations('Common')
  const td = await getTranslations('Data')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/login`)

  const { data: profile } = await supabase
    .from('profile')
    .select('role, district_id, full_name')
    .eq('id', user.id)
    .single()
  const role = profile?.role as AppRole | undefined
  const isFocal = role === 'district_focal'
  const isRestricted = isFocal || !role || role === 'viewer'

  if (isRestricted) {
    let query = supabase
      .from('alert_candidate')
      .select(`${LIST_COLUMNS}, district:district_id(name_en, name_ur, province)`)
      .eq('status', 'issued')
      .order('issued_at', { ascending: false })
      .limit(50)
    // District focals only see their own district; viewers see all provincial alerts
    if (isFocal && profile?.district_id) {
      query = query.eq('district_id', profile.district_id)
    }
    const { data: issued, error } = await query
    if (error) console.error('[alerts] restricted list failed:', error.message)

    const roleLabel = isFocal ? t('roleDistrictFocal') : t('roleViewer')
    const pageTitle = isFocal ? t('districtAlerts') : t('provincialAlerts')
    const helpText = isFocal ? t('helpFocal') : t('helpViewer')

    return (
      <div className="flex h-screen flex-col bg-[var(--color-base)]">
        <header className="flex items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-primary)] px-6 py-4">
          <Link href={`/${locale}/dashboard`} className="text-sm text-white/70 hover:text-white">
            {tc('backToOverview')}
          </Link>
          <h1 className="text-lg font-semibold text-white">{pageTitle}</h1>
          <span className="ms-auto rounded-full bg-white/10 px-3 py-1 font-mono text-xs uppercase text-white">
            {roleLabel}
          </span>
        </header>

        <div className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-4xl">
            <p className="mb-4 text-sm text-[var(--color-ink)]/60">
              {helpText}
            </p>
            {isFocal && !profile?.district_id && (
              <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {t('noDistrictAssigned')}
              </p>
            )}
            {(issued ?? []).length === 0 ? (
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center text-[var(--color-ink)]/50">
                {isFocal ? t('noIssuedForDistrict') : t('noIssuedAlerts')}
              </div>
            ) : (
              <div className="space-y-4">
                {(issued ?? []).map((c) => {
                  const text = localizeAlertFields(locale, c)
                  return (
                  <div key={c.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="rounded bg-[var(--color-emergency)]/10 px-2 py-0.5 font-mono text-xs font-bold uppercase text-[var(--color-emergency)]">
                        {dataLabel(td, 'severity', c.severity)}
                      </span>
                      <span className="font-mono text-xs text-[var(--color-ink)]/40">
                        {t('issued')} {c.issued_at ? new Date(c.issued_at).toLocaleString(locale === 'ur' ? 'ur-PK' : 'en-GB') : '—'}
                      </span>
                    </div>
                    <Link
                      href={`/${locale}/dashboard/alerts/${c.id}`}
                      className="text-lg font-semibold text-[var(--color-ink)] hover:underline"
                    >
                      {text.headline}
                    </Link>
                    <p className="mt-1 text-sm text-[var(--color-ink)]/70">{text.event}</p>
                    <div className="mt-4 flex gap-3">
                      <Link
                        href={`/${locale}/dashboard/alerts/${c.id}/dissemination`}
                        className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
                      >
                        {t('disseminationAck')}
                      </Link>
                      <Link
                        href={`/${locale}/dashboard/alerts/${c.id}`}
                        className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--color-border)]"
                      >
                        {t('viewCap')}
                      </Link>
                    </div>
                  </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  const [{ data: candidates, error }, { count: openTotal }] = await Promise.all([
    supabase
      .from('alert_candidate')
      .select(`${LIST_COLUMNS}, district:district_id(name_en, name_ur, province)`)
      .in('status', ['pending', 'draft', 'pending_approval'])
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('alert_candidate')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'draft', 'pending_approval']),
  ])

  if (error) {
    console.error('[alerts] list query failed:', error.message)
  }

  const sortedCandidates = (candidates ?? []).sort((a, b) => {
    const rank: Record<string, number> = { pending_approval: 1, draft: 2, pending: 3 }
    return (rank[a.status] || 99) - (rank[b.status] || 99)
  })

  const showing = sortedCandidates.length
  const totalOpen = openTotal ?? showing

  return (
    <div className="flex h-screen flex-col bg-[var(--color-base)]">
      <header className="flex items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-primary)] px-6 py-4">
        <Link href={`/${locale}/dashboard`} className="text-sm text-white/70 hover:text-white">
          {tc('backToOverview')}
        </Link>
        <h1 className="text-lg font-semibold text-white">{t('candidateReview')}</h1>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-4xl">
          <p className="mb-4 text-sm text-[var(--color-ink)]/60">
            {t('helpOps')}
          </p>
          {totalOpen > showing && (
            <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {t('showingRecent', { showing, total: totalOpen.toLocaleString() })}
            </p>
          )}
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">
            {totalOpen > showing
              ? t('openCandidatesOf', { showing, total: totalOpen.toLocaleString() })
              : t('openCandidates', { showing })}
          </h2>

          {sortedCandidates.length === 0 ? (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center text-[var(--color-ink)]/50">
              {t('noCandidates')}
            </div>
          ) : (
            <div className="space-y-4">
              {sortedCandidates.map((c) => {
                const text = localizeAlertFields(locale, c)
                return (
                <div key={c.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-[var(--color-emergency)]/10 px-2 py-0.5 font-mono text-xs font-bold uppercase text-[var(--color-emergency)]">
                        {dataLabel(td, 'severity', c.severity)}
                      </span>
                      {c.status === 'pending_approval' && (
                        <span className="rounded border border-yellow-300 bg-yellow-100 px-2 py-0.5 font-mono text-xs font-bold uppercase text-yellow-800">
                          {t('requiresDgApproval')}
                        </span>
                      )}
                      {c.status === 'draft' && (
                        <span className="rounded border border-gray-300 bg-gray-100 px-2 py-0.5 font-mono text-xs font-bold uppercase text-gray-600">
                          {t('draftingInProgress')}
                        </span>
                      )}
                      {c.status === 'pending' && (
                        <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 font-mono text-xs font-bold uppercase text-blue-600">
                          {t('newAwaitingDraft')}
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-xs text-[var(--color-ink)]/40">
                      {t('generated')} {new Date(c.created_at).toLocaleString(locale === 'ur' ? 'ur-PK' : 'en-GB')}
                    </span>
                  </div>
                  <Link
                    href={`/${locale}/dashboard/alerts/${c.id}`}
                    className="text-lg font-semibold text-[var(--color-ink)] hover:underline"
                  >
                    {text.headline}
                  </Link>
                  <p className="mt-1 text-sm text-[var(--color-ink)]/70">{c.description || text.event}</p>

                  <div className="mt-4 grid grid-cols-2 gap-4 rounded bg-[var(--color-base)] p-3 font-mono text-xs">
                    <div>
                      <span className="text-[var(--color-ink)]/50">{t('metric')}:</span> {c.metric_name}
                    </div>
                    <div>
                      <span className="text-[var(--color-ink)]/50">{t('district')}:</span>{' '}
                      {c.district
                        ? `${districtDisplayName(locale, c.district.name_en, c.district.name_ur)}, ${provinceDisplayName(locale, c.district.province)}`
                        : t('global')}
                    </div>
                    <div>
                      <span className="text-[var(--color-ink)]/50">{t('observed')}:</span> {c.observed_value}
                    </div>
                    <div>
                      <span className="text-[var(--color-ink)]/50">{t('threshold')}:</span> {c.threshold_value}
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link
                      href={`/${locale}/dashboard/alerts/${c.id}`}
                      className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[var(--color-primary-hover)]"
                    >
                      {t('openCapComposer')}
                    </Link>
                    {c.status === 'pending' && (
                      <form action={dismissCandidate}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="locale" value={locale} />
                        <button
                          type="submit"
                          className="rounded-md border border-[var(--color-border)] bg-transparent px-4 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-border)]"
                        >
                          {t('dismiss')}
                        </button>
                      </form>
                    )}
                  </div>
                </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
