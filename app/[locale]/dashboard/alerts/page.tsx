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
import PageHeader from '../PageHeader'

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

function severityAccent(severity: string | null | undefined) {
  switch (severity) {
    case 'extreme':
    case 'severe':
    case 'emergency':
      return 'border-s-[var(--color-emergency)]'
    case 'moderate':
      return 'border-s-[var(--color-warn)]'
    default:
      return 'border-s-[var(--color-primary)]'
  }
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
    if (isFocal && profile?.district_id) {
      query = query.eq('district_id', profile.district_id)
    }
    const { data: issued, error } = await query
    if (error) console.error('[alerts] restricted list failed:', error.message)

    const roleLabel = isFocal ? t('roleDistrictFocal') : t('roleViewer')
    const pageTitle = isFocal ? t('districtAlerts') : t('provincialAlerts')
    const helpText = isFocal ? t('helpFocal') : t('helpViewer')

    return (
      <div className="flex min-h-dvh flex-col bg-[var(--color-base)]">
        <PageHeader
          locale={locale}
          title={pageTitle}
          backLabel={tc('backToOverview')}
          trailing={
            <span className="rounded-full bg-white/10 px-2.5 py-1 font-mono text-[10px] uppercase text-white sm:text-xs">
              {roleLabel}
            </span>
          }
        />

        <div className="dashboard-page-body flex-1 overflow-auto px-3 pt-4 sm:px-6 sm:pt-6">
          <div className="mx-auto max-w-4xl">
            <p className="mb-4 text-sm leading-relaxed text-[var(--color-ink)]/60">{helpText}</p>
            {isFocal && !profile?.district_id && (
              <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {t('noDistrictAssigned')}
              </p>
            )}
            {(issued ?? []).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-12 text-center text-sm text-[var(--color-ink)]/50">
                {isFocal ? t('noIssuedForDistrict') : t('noIssuedAlerts')}
              </div>
            ) : (
              <div className="space-y-3">
                {(issued ?? []).map((c) => {
                  const text = localizeAlertFields(locale, c)
                  return (
                    <article
                      key={c.id}
                      className={`overflow-hidden rounded-2xl border border-[var(--color-border)] border-s-4 bg-[var(--color-surface)] shadow-sm ${severityAccent(c.severity)}`}
                    >
                      <div className="p-4 sm:p-5">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-[var(--color-emergency)]/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-[var(--color-emergency)]">
                            {dataLabel(td, 'severity', c.severity)}
                          </span>
                          <span className="font-mono text-[10px] text-[var(--color-ink)]/40 sm:text-xs">
                            {t('issued')}{' '}
                            {c.issued_at
                              ? new Date(c.issued_at).toLocaleString(locale === 'ur' ? 'ur-PK' : 'en-GB')
                              : '—'}
                          </span>
                        </div>
                        <h3 className="text-base font-semibold leading-snug sm:text-lg">
                          <Link
                            href={`/${locale}/dashboard/alerts/${c.id}`}
                            className="text-ink no-underline hover:text-[var(--color-primary)] active:opacity-70"
                          >
                            {text.headline}
                          </Link>
                        </h3>
                        <p className="mt-1 text-sm text-[var(--color-ink)]/65">{text.event}</p>
                        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <Link
                            href={`/${locale}/dashboard/alerts/${c.id}/dissemination`}
                            className="tap-target flex items-center justify-center rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white active:bg-[var(--color-primary-hover)]"
                          >
                            {t('disseminationAck')}
                          </Link>
                          <Link
                            href={`/${locale}/dashboard/alerts/${c.id}`}
                            className="tap-target flex items-center justify-center rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm font-semibold text-[var(--color-ink)] active:bg-[var(--color-base)]"
                          >
                            {t('viewCap')}
                          </Link>
                        </div>
                      </div>
                    </article>
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
    <div className="flex min-h-dvh flex-col bg-[var(--color-base)]">
      <PageHeader locale={locale} title={t('candidateReview')} backLabel={tc('backToOverview')} />

      <div className="dashboard-page-body flex-1 overflow-auto px-3 pt-4 sm:px-6 sm:pt-6">
        <div className="mx-auto max-w-4xl">
          <p className="mb-4 text-sm leading-relaxed text-[var(--color-ink)]/60">{t('helpOps')}</p>
          {totalOpen > showing && (
            <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {t('showingRecent', { showing, total: totalOpen.toLocaleString() })}
            </p>
          )}
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink)]/45">
            {totalOpen > showing
              ? t('openCandidatesOf', { showing, total: totalOpen.toLocaleString() })
              : t('openCandidates', { showing })}
          </h2>

          {sortedCandidates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-12 text-center text-sm text-[var(--color-ink)]/50">
              {t('noCandidates')}
            </div>
          ) : (
            <div className="space-y-3">
              {sortedCandidates.map((c) => {
                const text = localizeAlertFields(locale, c)
                return (
                  <article
                    key={c.id}
                    className={`overflow-hidden rounded-2xl border border-[var(--color-border)] border-s-4 bg-[var(--color-surface)] shadow-sm ${severityAccent(c.severity)}`}
                  >
                    <div className="p-4 sm:p-5">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-[var(--color-emergency)]/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-[var(--color-emergency)]">
                          {dataLabel(td, 'severity', c.severity)}
                        </span>
                        {c.status === 'pending_approval' && (
                          <span className="rounded-md border border-yellow-300 bg-yellow-100 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-yellow-800">
                            {t('requiresDgApproval')}
                          </span>
                        )}
                        {c.status === 'draft' && (
                          <span className="rounded-md border border-gray-300 bg-gray-100 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-gray-600">
                            {t('draftingInProgress')}
                          </span>
                        )}
                        {c.status === 'pending' && (
                          <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-blue-600">
                            {t('newAwaitingDraft')}
                          </span>
                        )}
                        <span className="ms-auto font-mono text-[10px] text-[var(--color-ink)]/40">
                          {t('generated')}{' '}
                          {new Date(c.created_at).toLocaleString(locale === 'ur' ? 'ur-PK' : 'en-GB')}
                        </span>
                      </div>
                      <h3 className="text-base font-semibold leading-snug sm:text-lg">
                        <Link
                          href={`/${locale}/dashboard/alerts/${c.id}`}
                          className="text-ink no-underline hover:text-[var(--color-primary)] active:opacity-70"
                        >
                          {text.headline}
                        </Link>
                      </h3>
                      <p className="mt-1 text-sm text-[var(--color-ink)]/65">{c.description || text.event}</p>

                      <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[var(--color-base)] p-3 font-mono text-[11px]">
                        <div>
                          <span className="text-[var(--color-ink)]/45">{t('metric')}</span>
                          <p className="truncate text-[var(--color-ink)]">{c.metric_name}</p>
                        </div>
                        <div>
                          <span className="text-[var(--color-ink)]/45">{t('district')}</span>
                          <p className="truncate text-[var(--color-ink)]">
                            {c.district
                              ? `${districtDisplayName(locale, c.district.name_en, c.district.name_ur)}, ${provinceDisplayName(locale, c.district.province)}`
                              : t('global')}
                          </p>
                        </div>
                        <div>
                          <span className="text-[var(--color-ink)]/45">{t('observed')}</span>
                          <p className="text-[var(--color-ink)]">{c.observed_value}</p>
                        </div>
                        <div>
                          <span className="text-[var(--color-ink)]/45">{t('threshold')}</span>
                          <p className="text-[var(--color-ink)]">{c.threshold_value}</p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <Link
                          href={`/${locale}/dashboard/alerts/${c.id}`}
                          className="tap-target flex flex-1 items-center justify-center rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white active:bg-[var(--color-primary-hover)]"
                        >
                          {t('openCapComposer')}
                        </Link>
                        {c.status === 'pending' && (
                          <form action={dismissCandidate} className="sm:contents">
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="locale" value={locale} />
                            <button
                              type="submit"
                              className="tap-target w-full rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm font-semibold text-[var(--color-ink)] active:bg-[var(--color-base)] sm:w-auto"
                            >
                              {t('dismiss')}
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
