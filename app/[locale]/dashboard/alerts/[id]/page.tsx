import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import PrintButton from './PrintButton'
import AuditTimeline from './AuditTimeline'
import { logAudit, type AuditLogRow } from '@/lib/audit'
import CapEditorForm from './CapEditorForm'
import {
  getAllowedTransitions,
  canEscalate,
  canEditCap,
  canTransition,
  escalateSeverity,
  isDistrictFocal,
  type AppRole,
} from '@/lib/alert-workflow'
import { getTranslations } from 'next-intl/server'
import {
  dataLabel,
  districtDisplayName,
  localizeAlertFields,
  provinceDisplayName,
  workflowLabel,
} from '@/lib/localized'
import PageHeader from '../../PageHeader'

async function transitionStatus(formData: FormData) {
  'use server'
  const id = formData.get('id') as string
  const newStatus = formData.get('new_status') as string
  const locale = (formData.get('locale') as string) || 'en'
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase.from('profile').select('role').eq('id', user.id).single()
  const role = profile?.role as AppRole | undefined

  const { data: current } = await supabase.from('alert_candidate').select('status').eq('id', id).single()
  if (!current) throw new Error('Alert not found')

  if (!canTransition(role, current.status, newStatus)) {
    throw new Error(`Role ${role ?? 'unknown'} cannot move ${current.status} → ${newStatus}`)
  }

  const updates: Record<string, unknown> = { status: newStatus }
  if (newStatus === 'issued') {
    updates.issued_by = user.id
    updates.issued_at = new Date().toISOString()
  }

  const { error } = await supabase.from('alert_candidate').update(updates).eq('id', id)
  if (error) throw new Error(error.message)

  if (newStatus === 'issued') {
    const { data: alertRow } = await supabase
      .from('alert_candidate')
      .select('district_id')
      .eq('id', id)
      .single()
    if (alertRow?.district_id) {
      try {
        const { fanOutOnIssue } = await import('./dissemination-actions')
        await fanOutOnIssue(id, alertRow.district_id, locale)
      } catch (err) {
        // Alert is already issued — don't roll back; surface fan-out failure in audit instead.
        console.error('[issue] fan-out failed:', err)
        await logAudit(supabase, {
          actor: user.id,
          actor_role: profile?.role || 'viewer',
          action: 'dissemination_fanout_failed',
          entity: 'alert_candidate',
          entity_id: id,
          detail: { error: err instanceof Error ? err.message : String(err) },
        })
      }
    }
  }

  revalidatePath(`/${locale}/dashboard/alerts/${id}`)
  revalidatePath(`/${locale}/dashboard/alerts`)
}

async function escalateAlertSeverity(formData: FormData) {
  'use server'
  const id = formData.get('id') as string
  const locale = (formData.get('locale') as string) || 'en'
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase.from('profile').select('role').eq('id', user.id).single()
  const role = profile?.role as AppRole | undefined

  const { data: alert } = await supabase.from('alert_candidate').select('severity, status').eq('id', id).single()
  if (!alert) throw new Error('Alert not found')
  if (!canEscalate(role, alert.status)) throw new Error('Cannot escalate in current state')

  const next = escalateSeverity(alert.severity)
  if (!next) throw new Error('Already at maximum severity')

  const { error } = await supabase.from('alert_candidate').update({ severity: next }).eq('id', id)
  if (error) throw new Error(error.message)

  await logAudit(supabase, {
    action: 'escalate_severity',
    entity: 'alert_candidate',
    entity_id: id,
    actor: user.id,
    actor_role: profile?.role || 'viewer',
    detail: { from: alert.severity, to: next },
  })

  revalidatePath(`/${locale}/dashboard/alerts/${id}`)
}

export default async function AlertComposerPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>
}) {
  const { id, locale } = await params
  const td = await getTranslations('Data')
  const ta = await getTranslations('Alerts')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/login`)

  const { data: profile } = await supabase.from('profile').select('role, district_id').eq('id', user.id).single()
  const role = profile?.role as AppRole | undefined
  const canEdit = canEditCap(role)
  const focalReadOnly = isDistrictFocal(role)

  const { data: alert } = await supabase
    .from('alert_candidate')
    .select('*, district:district_id(name_en, name_ur, province)')
    .eq('id', id)
    .single()

  if (!alert) notFound()

  // District focals only see alerts for their assigned district
  if (
    focalReadOnly &&
    profile?.district_id &&
    alert.district_id &&
    alert.district_id !== profile.district_id
  ) {
    redirect(`/${locale}/dashboard/alerts`)
  }

  const { data: auditLogs } = await supabase
    .from('audit_log')
    .select('*')
    .eq('entity_id', id)
    .order('at', { ascending: true })

  let deliveryStats: {
    total: number
    queued: number
    sent: number
    delivered: number
    failed: number
    acknowledged: number
    ackRate: number
  } | null = null
  if (alert.status === 'issued' || alert.status === 'cancelled') {
    const { data: deliveries } = await supabase.from('alert_delivery').select('status').eq('alert_id', id)
    if (deliveries && deliveries.length > 0) {
      const acknowledged = deliveries.filter((d) => d.status === 'acknowledged').length
      deliveryStats = {
        total: deliveries.length,
        queued: deliveries.filter((d) => d.status === 'queued').length,
        sent: deliveries.filter((d) => d.status === 'sent').length,
        delivered: deliveries.filter((d) => d.status === 'delivered').length,
        failed: deliveries.filter((d) => d.status === 'failed').length,
        acknowledged,
        ackRate: Math.round((acknowledged / deliveries.length) * 100),
      }
    }
  }

  const actorIds = [...new Set((auditLogs ?? []).map((l) => l.actor).filter(Boolean))] as string[]
  const actorNames: Record<string, string> = {}
  if (actorIds.length > 0) {
    const { data: actors } = await supabase.from('profile').select('id, full_name').in('id', actorIds)
    for (const a of actors ?? []) {
      if (a.full_name) actorNames[a.id] = a.full_name
    }
  }

  const allowedNext = getAllowedTransitions(role, alert.status).filter(
    (status) => status !== 'pending_approval' || role === 'duty_officer'
  )
  const primaryAction = allowedNext.find((s) => s === 'issued') ?? allowedNext[0]
  const secondaryActions = allowedNext.filter((s) => s !== primaryAction)
  const nextSeverity = escalateSeverity(alert.severity)
  const showEscalate = canEscalate(role, alert.status) && nextSeverity !== null

  const capExportable = alert.status === 'issued' || alert.status === 'cancelled'
  const localized = localizeAlertFields(locale, alert)
  const districtLabel = alert.district
    ? `${districtDisplayName(locale, alert.district.name_en, alert.district.name_ur)}, ${provinceDisplayName(locale, alert.district.province)}`
    : ta('global')

  return (
    <div className="min-h-dvh bg-[var(--color-base)]">
      <div className="print:hidden">
        <PageHeader
          locale={locale}
          title={focalReadOnly ? localized.headline : 'CAP Composer'}
          backHref={`/${locale}/dashboard/alerts`}
          backLabel={`← ${focalReadOnly ? ta('districtAlerts') : ta('candidateReview')}`}
          trailing={
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="rounded-full bg-white/10 px-2 py-1 font-mono text-[10px] uppercase text-white sm:px-3 sm:text-xs">
                {dataLabel(td, 'status', alert.status)}
              </span>
              <span className="hidden rounded-full bg-white/5 px-3 py-1 font-mono text-xs uppercase text-white/70 sm:inline">
                {role?.replace('_', ' ')}
              </span>
              <PrintButton alertId={alert.id} locale={locale} disabled={!capExportable} />
            </div>
          }
        />
      </div>

      <div className="dashboard-page-body mx-auto max-w-3xl space-y-4 px-3 pt-4 sm:space-y-6 sm:px-6 sm:pt-6">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">Source</h2>
          <p className="text-sm text-[var(--color-ink)]">
            {localized.headline} — {districtLabel}
          </p>
          <p className="mt-1 text-xs text-[var(--color-ink)]/50">
            {ta('metric')}: {alert.metric_name} · {ta('observed')}: {alert.observed_value} · {ta('threshold')}: {alert.threshold_value}
          </p>
          {(alert.event_en || alert.event_ur) && (
            <p className="mt-2 text-xs text-[var(--color-ink)]/60">
              CAP: {localized.event}
              {alert.urgency ? ` · urgency ${alert.urgency}` : ''}
            </p>
          )}
        </div>

        <CapEditorForm
          alert={alert}
          locale={locale}
          canEdit={canEdit}
          focalReadOnly={focalReadOnly}
        />

        {(allowedNext.length > 0 || showEscalate) && (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">Workflow</h2>
            {alert.status === 'pending_approval' && role === 'dg' && (
              <p className="mb-3 text-sm text-[var(--color-ink)]/70">
                This alert is ready for your approval. Click <strong>Issue alert</strong> to publish the CAP warning.
              </p>
            )}
            {alert.status === 'pending_approval' && role !== 'dg' && (
              <p className="mb-3 text-sm text-amber-800">
                Submitted for DG approval. Your role is <strong>{role ?? 'unknown'}</strong> — only DG can issue.
              </p>
            )}
            {alert.status === 'draft' && role === 'dg' && (
              <p className="mb-3 text-sm text-[var(--color-ink)]/70">
                As DG you can <strong>Issue alert</strong> directly, or submit for approval if another DG must sign off.
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              {primaryAction && (
                <form action={transitionStatus}>
                  <input type="hidden" name="id" value={alert.id} />
                  <input type="hidden" name="new_status" value={primaryAction} />
                  <input type="hidden" name="locale" value={locale} />
                  <button
                    type="submit"
                    className={`rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm ${
                      primaryAction === 'issued'
                        ? 'bg-[var(--color-emergency)] hover:bg-red-700'
                        : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]'
                    }`}
                  >
                    {workflowLabel(td, alert.status, primaryAction)}
                  </button>
                </form>
              )}
              {secondaryActions.map((next) => (
                <form action={transitionStatus} key={next}>
                  <input type="hidden" name="id" value={alert.id} />
                  <input type="hidden" name="new_status" value={next} />
                  <input type="hidden" name="locale" value={locale} />
                  <button
                    type="submit"
                    className={`rounded-md px-4 py-2 text-sm font-semibold shadow-sm ${
                      next === 'cancelled' || next === 'dismissed'
                        ? 'border border-[var(--color-border)] bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-border)]'
                        : 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]'
                    }`}
                  >
                    {workflowLabel(td, alert.status, next)}
                  </button>
                </form>
              ))}
              {showEscalate && (
                <form action={escalateAlertSeverity}>
                  <input type="hidden" name="id" value={alert.id} />
                  <input type="hidden" name="locale" value={locale} />
                  <button
                    type="submit"
                    className="rounded-md border-2 border-[var(--color-emergency)] bg-transparent px-4 py-2 text-sm font-semibold text-[var(--color-emergency)] hover:bg-[var(--color-emergency)]/10"
                  >
                    Escalate to {nextSeverity}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {capExportable && (
          <div className="flex flex-wrap gap-3">
            {alert.status === 'issued' && (
              <Link
                href={`/${locale}/dashboard/alerts/${alert.id}/dissemination`}
                className="rounded-md bg-[var(--color-emergency)] px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Dissemination Board
              </Link>
            )}
            <a
              href={`/api/alerts/${alert.id}/cap.json`}
              target="_blank"
              className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-border)]"
            >
              View CAP JSON
            </a>
            <a
              href={`/api/alerts/${alert.id}/cap.xml`}
              target="_blank"
              className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-border)]"
            >
              View CAP XML{alert.status === 'cancelled' ? ' (Cancel)' : ''}
            </a>
          </div>
        )}

        {(alert.status === 'issued' || alert.status === 'cancelled') && deliveryStats && (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">
              Delivery &amp; Acknowledgement Statistics
            </h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
              {[
                ['Dispatched', deliveryStats.total, 'text-[var(--color-ink)]'],
                ['In Transit', deliveryStats.queued + deliveryStats.sent, 'text-[var(--color-ink)]'],
                ['Delivered', deliveryStats.delivered, 'text-green-600'],
                ['Acknowledged', deliveryStats.acknowledged, 'text-[var(--color-primary)]'],
                ['Failed', deliveryStats.failed, 'text-red-600'],
              ].map(([label, val, cls]) => (
                <div key={label as string} className="rounded border border-[var(--color-border)] bg-white p-3 text-center shadow-sm">
                  <div className={`text-2xl font-mono font-bold ${cls}`}>{val as number}</div>
                  <div className="text-xs font-semibold uppercase text-[var(--color-ink)]/50">{label as string}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {auditLogs && auditLogs.length > 0 && (
          <AuditTimeline
            logs={auditLogs as AuditLogRow[]}
            actorNames={actorNames}
            locale={locale}
            deliveryStats={deliveryStats}
          />
        )}
      </div>
    </div>
  )
}
