import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { executeDryRunDispatch, executeLiveDispatch, acknowledgeDelivery } from '../dissemination-actions'
import AckSimulator from './ack-simulator'
import { buildSmsBody, segmentSms, CHANNEL_LABELS } from '@/lib/dissemination'
import { isTwilioSmsConfigured, isTwilioWhatsAppConfigured } from '@/lib/twilio'
import {
  canAcknowledge,
  canDispatch,
  canRunAckSimulation,
  type AppRole,
} from '@/lib/alert-workflow'
import { getTranslations } from 'next-intl/server'
import {
  dataLabel,
  districtDisplayName,
  localizeAlertFields,
  provinceDisplayName,
} from '@/lib/localized'
import PageHeader from '../../../PageHeader'

export default async function DisseminationBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; locale: string }>
  searchParams: Promise<{ error?: string; ok?: string }>
}) {
  const { id, locale } = await params
  const td = await getTranslations('Data')
  const ta = await getTranslations('Alerts')
  const { error: queryError, ok: queryOk } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/login`)

  const { data: profile } = await supabase
    .from('profile')
    .select('role, district_id')
    .eq('id', user.id)
    .single()
  const role = profile?.role as AppRole | undefined
  const staff = canDispatch(role)

  const { data: alert } = await supabase
    .from('alert_candidate')
    .select('*, district:district_id(id, name_en, name_ur, province)')
    .eq('id', id)
    .single()

  if (!alert) notFound()
  if (alert.status !== 'issued') {
    redirect(`/${locale}/dashboard/alerts/${id}`)
  }

  const districtId = alert.district?.id ?? alert.district_id

  if (
    role === 'district_focal' &&
    profile?.district_id &&
    districtId &&
    profile.district_id !== districtId
  ) {
    redirect(`/${locale}/dashboard/alerts`)
  }

  const [{ data: recipientCounts }, { data: deliveries }, { data: contacts }] = await Promise.all([
    supabase.from('channel_recipient_count').select('channel, recipient_count').eq('district_id', districtId),
    supabase.from('alert_delivery').select('id, channel, recipient, status, status_at, ack_at, district_id').eq('alert_id', id),
    supabase.from('district_contact').select('role_title, phone_placeholder').eq('district_id', districtId),
  ])

  const deliveryList = deliveries ?? []
  const hasDeliveries = deliveryList.length > 0
  const dryRunPlanned = deliveryList.some((d) => d.status === 'dry_run')
  const dispatchActive = deliveryList.some((d) => ['queued', 'sent', 'delivered', 'acknowledged', 'failed'].includes(d.status))
  const totalRecipients = (recipientCounts ?? []).reduce((sum, c) => sum + c.recipient_count, 0)
  const canSim = canRunAckSimulation(role)

  const smsEn = segmentSms(buildSmsBody(alert, 'en'))
  const smsUr = alert.headline_ur || alert.instructions_ur ? segmentSms(buildSmsBody(alert, 'ur')) : null

  const twilioSmsConfigured = isTwilioSmsConfigured()
  const twilioWhatsAppConfigured = isTwilioWhatsAppConfigured()
  const whatsAppUsesTemplate = Boolean(process.env.TWILIO_WHATSAPP_CONTENT_SID?.trim())

  const sectionClass = 'rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5'
  const headingClass = 'mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60'

  const ackable = deliveryList.filter(
    (d) =>
      ['delivered', 'sent', 'queued'].includes(d.status) &&
      canAcknowledge(role, profile?.district_id, d.district_id ?? districtId)
  )

  return (
    <div className="min-h-dvh bg-[var(--color-base)]">
      <PageHeader
        locale={locale}
        title="Dissemination Board"
        backHref={`/${locale}/dashboard/alerts/${id}`}
        backLabel={`← ${staff ? 'CAP Composer' : 'Alert Detail'}`}
        trailing={
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-white/10 px-2 py-1 font-mono text-[10px] uppercase text-white sm:px-3 sm:text-xs">
              {alert.status}
            </span>
            {role && (
              <span className="hidden rounded-full bg-white/5 px-3 py-1 font-mono text-xs uppercase text-white/70 sm:inline">
                {role.replace('_', ' ')}
              </span>
            )}
          </div>
        }
      />

      <div className="dashboard-page-body mx-auto max-w-3xl space-y-4 px-3 pt-4 sm:space-y-6 sm:px-6 sm:pt-6">
        <div className={sectionClass}>
          <h2 className={headingClass}>Issuing</h2>
          <p className="text-sm text-[var(--color-ink)]">
            {localizeAlertFields(locale, alert).headline} —{' '}
            {alert.district
              ? `${districtDisplayName(locale, alert.district.name_en, alert.district.name_ur)}, ${provinceDisplayName(locale, alert.district.province)}`
              : ta('global')}
          </p>
          <p className="mt-1 text-xs text-[var(--color-ink)]/50">
            {ta('severity')}: {dataLabel(td, 'severity', alert.severity)} · Urgency: {alert.urgency ?? '—'} · Certainty:{' '}
            {alert.certainty ?? '—'}
          </p>
          {hasDeliveries && dryRunPlanned && (
            <p className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              Fan-out plan created on issue ({deliveryList.length} delivery rows). Execute dry run to queue messages.
            </p>
          )}
        </div>

        <div className={sectionClass}>
          <h2 className={headingClass}>SMS Preview — English</h2>
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-base)] p-3 font-mono text-sm text-[var(--color-ink)]">
            <p className="whitespace-pre-wrap">{smsEn.text}</p>
          </div>
          <p className="mt-2 text-xs text-[var(--color-ink)]/50">
            {smsEn.charCount} chars · {smsEn.encoding} · {smsEn.segmentCount} segment{smsEn.segmentCount > 1 ? 's' : ''}{' '}
            ({smsEn.segmentCount > 1 ? `${smsEn.multipartLimit} chars/part` : `${smsEn.singleLimit} char limit`})
          </p>
        </div>

        <div className={sectionClass}>
          <h2 className={headingClass}>SMS Preview — Urdu</h2>
          {smsUr ? (
            <>
              <div dir="rtl" className="rounded-md border border-[var(--color-border)] bg-[var(--color-base)] p-3 text-sm text-[var(--color-ink)]">
                <p className="whitespace-pre-wrap">{smsUr.text}</p>
              </div>
              <p className="mt-2 text-xs text-[var(--color-ink)]/50">
                {smsUr.charCount} chars · {smsUr.encoding} · {smsUr.segmentCount} segment{smsUr.segmentCount > 1 ? 's' : ''}
              </p>
            </>
          ) : (
            <div className="rounded-md border border-dashed border-[var(--color-emergency)]/50 bg-[var(--color-emergency)]/5 p-3 text-sm text-[var(--color-emergency)]">
              No Urdu translation — add Urdu CAP fields before live public dispatch.
            </div>
          )}
        </div>

        <div className={sectionClass}>
          <h2 className={headingClass}>WhatsApp Preview — English</h2>
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-base)] p-3 text-sm text-[var(--color-ink)]">
            <p className="whitespace-pre-wrap">{smsEn.text}</p>
          </div>
        </div>

        {contacts && contacts.length > 0 && (
          <div className={sectionClass}>
            <h2 className={headingClass}>District Focal Roster (demo)</h2>
            <div className="space-y-2">
              {contacts.map((c, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>{c.role_title}</span>
                  <span className="font-mono text-xs text-[var(--color-ink)]/60">{c.phone_placeholder}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={sectionClass}>
          <h2 className={headingClass}>Channel Breakdown</h2>
          {recipientCounts && recipientCounts.length > 0 ? (
            <div className="space-y-2">
              {recipientCounts.map((c) => {
                const channelDeliveries = deliveryList.filter((d) => d.channel === c.channel)
                const status = channelDeliveries[0]?.status
                return (
                  <div key={c.channel} className="flex items-center justify-between text-sm">
                    <span>{CHANNEL_LABELS[c.channel] ?? c.channel}</span>
                    <span className="flex items-center gap-3 font-mono text-xs text-[var(--color-ink)]/60">
                      {c.recipient_count.toLocaleString()} recipients
                      {status && (
                        <span className="rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 uppercase text-[var(--color-primary)]">
                          {status}
                        </span>
                      )}
                    </span>
                  </div>
                )
              })}
              <p className="mt-3 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-ink)]/50">
                Total estimated reach: {totalRecipients.toLocaleString()} (demo counts)
              </p>
            </div>
          ) : (
            <p className="text-sm text-[var(--color-ink)]/50">No recipient data seeded for this district.</p>
          )}
        </div>

        {staff && (
          <div className={sectionClass}>
            <h2 className={headingClass}>Dispatch</h2>
            {queryError && (
              <div className="mb-3 rounded-md border border-[var(--color-emergency)]/40 bg-[var(--color-emergency)]/10 px-3 py-2 text-sm text-[var(--color-emergency)]">
                <p className="font-semibold">WhatsApp / Twilio send failed</p>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed opacity-95">{queryError}</p>
              </div>
            )}
            {queryOk === 'whatsapp' && (
              <p className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                WhatsApp message accepted by Twilio — check the phone for delivery.
              </p>
            )}
            {queryOk === 'sms' && (
              <p className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                SMS accepted by Twilio — check the phone for delivery.
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              {(dryRunPlanned || !hasDeliveries) && (
                <form action={executeDryRunDispatch.bind(null, id, districtId, locale)}>
                  <button
                    type="submit"
                    disabled={!recipientCounts || recipientCounts.length === 0}
                    className="rounded-md bg-[var(--color-emergency)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {dryRunPlanned ? 'Execute dry run (queue messages)' : 'Dispatch (dry run)'}
                  </button>
                </form>
              )}
              {twilioSmsConfigured && (
                <form action={executeLiveDispatch.bind(null, id, districtId, locale, 'sms')}>
                  <button
                    type="submit"
                    className="rounded-md border-2 border-[var(--color-emergency)] bg-transparent px-4 py-2 text-sm font-semibold text-[var(--color-emergency)] hover:bg-[var(--color-emergency)]/10"
                  >
                    Send live SMS (Twilio)
                  </button>
                </form>
              )}
              {twilioWhatsAppConfigured && (
                <form action={executeLiveDispatch.bind(null, id, districtId, locale, 'whatsapp')}>
                  <button
                    type="submit"
                    className="rounded-md border-2 border-emerald-600 bg-transparent px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                  >
                    Send live WhatsApp (Twilio)
                  </button>
                </form>
              )}
            </div>
            <p className="mt-2 text-xs text-[var(--color-ink)]/50">
              Dry run is the default — no real messages unless Twilio is configured and you click a live send button.
            </p>
            {twilioWhatsAppConfigured && !whatsAppUsesTemplate && (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                <p className="font-semibold">WhatsApp sandbox (free-form)</p>
                <ol className="mt-1 list-decimal space-y-1 pl-4">
                  <li>
                    In Twilio Console → Messaging → Try it out → WhatsApp, copy the join code (e.g.{' '}
                    <code>join &lt;word-word&gt;</code>).
                  </li>
                  <li>
                    From phone <code>TWILIO_WHATSAPP_TO</code>, message <code>+1 415 523 8886</code> with that join
                    code.
                  </li>
                  <li>Retry <strong>Send live WhatsApp</strong> within 24 hours of that inbound message.</li>
                </ol>
                <p className="mt-2">
                  Outside that window Twilio returns <code>63016</code> unless you set{' '}
                  <code>TWILIO_WHATSAPP_CONTENT_SID</code> to an approved template.
                </p>
              </div>
            )}
          </div>
        )}

        {ackable.length > 0 && (
          <div className={sectionClass}>
            <h2 className={headingClass}>Field Acknowledgement</h2>
            <p className="mb-3 text-sm text-[var(--color-ink)]/60">
              Confirm receipt for deliveries in your district.
            </p>
            <div className="space-y-2">
              {ackable.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {CHANNEL_LABELS[d.channel] ?? d.channel}
                    <span className="ml-2 font-mono text-xs uppercase text-[var(--color-ink)]/40">{d.status}</span>
                  </span>
                  <form action={acknowledgeDelivery.bind(null, d.id, locale)}>
                    <button
                      type="submit"
                      className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-primary-hover)]"
                    >
                      Acknowledge
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </div>
        )}

        {canSim && dispatchActive && deliveryList.length > 0 && (
          <AckSimulator alertId={id} initialDeliveries={deliveryList} />
        )}
      </div>
    </div>
  )
}
