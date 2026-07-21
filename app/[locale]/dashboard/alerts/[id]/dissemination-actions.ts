'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { activateDryRunDispatch, fanOutAlert } from '@/lib/dissemination-fanout'
import { buildSmsBody } from '@/lib/dissemination'
import { logAudit } from '@/lib/audit'
import {
  canAcknowledge,
  canDispatch,
  type AppRole,
} from '@/lib/alert-workflow'
import {
  getTwilioCredentials,
  getWhatsAppFrom,
  getWhatsAppTo,
  isTwilioSmsConfigured,
  isTwilioWhatsAppConfigured,
  normalizeSmsAddress,
  sendTwilioMessage,
  waitForTwilioMessageStatus,
  explainTwilioWhatsAppFailure,
  type TwilioChannel,
} from '@/lib/twilio'

function disseminationPath(locale: string, alertId: string, query?: Record<string, string>) {
  const base = `/${locale}/dashboard/alerts/${alertId}/dissemination`
  if (!query || Object.keys(query).length === 0) return base
  const qs = new URLSearchParams(query).toString()
  return `${base}?${qs}`
}

async function assertStaff(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('profile')
    .select('role, district_id')
    .eq('id', user.id)
    .single()
  if (!canDispatch(profile?.role as AppRole)) {
    throw new Error('Only duty officers or DG can dispatch alerts')
  }
  return { user, profile }
}

/** District focal (own district) or provincial ops — mark a delivery acknowledged. */
export async function acknowledgeDelivery(deliveryId: string, locale = 'en') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('profile')
    .select('role, district_id, full_name')
    .eq('id', user.id)
    .single()

  const { data: delivery } = await supabase
    .from('alert_delivery')
    .select('id, alert_id, district_id, status')
    .eq('id', deliveryId)
    .single()

  if (!delivery) throw new Error('Delivery not found')

  if (
    !canAcknowledge(
      profile?.role as AppRole,
      profile?.district_id,
      delivery.district_id
    )
  ) {
    throw new Error('Not allowed to acknowledge this delivery')
  }

  if (delivery.status === 'acknowledged') return

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('alert_delivery')
    .update({
      status: 'acknowledged',
      status_at: now,
      ack_at: now,
      ack_by: profile?.full_name || profile?.role || user.email || 'district_focal',
    })
    .eq('id', deliveryId)

  if (error) throw new Error(error.message)

  await logAudit(supabase, {
    actor: user.id,
    actor_role: profile?.role ?? 'district_focal',
    action: 'acknowledgement_received',
    entity: 'alert_candidate',
    entity_id: delivery.alert_id,
    detail: { delivery_id: deliveryId, mode: 'manual_focal_ack' },
  })

  revalidatePath(`/${locale}/dashboard/alerts/${delivery.alert_id}/dissemination`)
  revalidatePath(`/${locale}/dashboard/alerts/${delivery.alert_id}`)
}

export async function fanOutOnIssue(alertId: string, districtId: string | null, locale = 'en') {
  const supabase = await createClient()
  const { user, profile } = await assertStaff(supabase)

  const result = await fanOutAlert(supabase, alertId, districtId, 'dry_run')

  if (result.rowsCreated > 0) {
    await logAudit(supabase, {
      actor: user.id,
      actor_role: profile?.role ?? 'unknown',
      action: 'dissemination_fanout_on_issue',
      entity: 'alert_candidate',
      entity_id: alertId,
      detail: { mode: 'dry_run', rows: result.rowsCreated, channels: result.channels },
    })
  }

  revalidatePath(`/${locale}/dashboard/alerts/${alertId}`)
  revalidatePath(`/${locale}/dashboard/alerts/${alertId}/dissemination`)
  return result
}

export async function executeDryRunDispatch(alertId: string, districtId: string, locale = 'en') {
  const supabase = await createClient()
  const { user, profile } = await assertStaff(supabase)

  await fanOutAlert(supabase, alertId, districtId, 'dry_run')
  const activated = await activateDryRunDispatch(supabase, alertId)

  await logAudit(supabase, {
    actor: user.id,
    actor_role: profile?.role ?? 'unknown',
    action: 'dissemination_dry_run_started',
    entity: 'alert_candidate',
    entity_id: alertId,
    detail: { activated, mode: 'dry_run' },
  })

  revalidatePath(`/${locale}/dashboard/alerts/${alertId}/dissemination`)
}

async function markChannelSent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  alertId: string,
  channel: TwilioChannel
) {
  const { data: row } = await supabase
    .from('alert_delivery')
    .select('id')
    .eq('alert_id', alertId)
    .eq('channel', channel)
    .limit(1)
    .maybeSingle()

  if (row) {
    await supabase
      .from('alert_delivery')
      .update({ status: 'sent', status_at: new Date().toISOString() })
      .eq('id', row.id)
  }
}

/** Send one live message via Twilio SMS or WhatsApp sandbox. */
export async function executeLiveDispatch(
  alertId: string,
  districtId: string,
  locale = 'en',
  channel: TwilioChannel = 'sms'
) {
  const supabase = await createClient()
  let errorMessage: string | null = null
  let okChannel: TwilioChannel | null = null

  try {
    const { user, profile } = await assertStaff(supabase)

    if (channel === 'sms' && !isTwilioSmsConfigured()) {
      errorMessage =
        'Twilio SMS not configured — set TWILIO_FROM_NUMBER and TWILIO_TO_NUMBER in .env.local'
    } else if (channel === 'whatsapp' && !isTwilioWhatsAppConfigured()) {
      errorMessage =
        'Twilio WhatsApp not configured — set TWILIO_WHATSAPP_FROM and TWILIO_WHATSAPP_TO in .env.local'
    } else {
      const { data: alert } = await supabase
        .from('alert_candidate')
        .select('headline_en, event_en, instructions_en, severity, title')
        .eq('id', alertId)
        .single()

      if (!alert) {
        errorMessage = 'Alert not found'
      } else {
        const body = buildSmsBody(alert, 'en').slice(0, channel === 'whatsapp' ? 4096 : 1600)
        const credentials = getTwilioCredentials()
        const contentSid = process.env.TWILIO_WHATSAPP_CONTENT_SID?.trim()

        const sendParams =
          channel === 'whatsapp'
            ? {
                credentials,
                channel: 'whatsapp' as const,
                from: getWhatsAppFrom(),
                to: getWhatsAppTo(),
                ...(contentSid ? { contentSid, contentVariables: { '1': body } } : { body }),
              }
            : {
                credentials,
                channel: 'sms' as const,
                from: normalizeSmsAddress(process.env.TWILIO_FROM_NUMBER!),
                to: normalizeSmsAddress(process.env.TWILIO_TO_NUMBER!),
                body,
              }

        const queued = await sendTwilioMessage(sendParams)
        const result =
          channel === 'whatsapp'
            ? await waitForTwilioMessageStatus(credentials, queued.sid)
            : queued

        if (channel === 'whatsapp' && ['undelivered', 'failed'].includes(result.status)) {
          await logAudit(supabase, {
            actor: user.id,
            actor_role: profile?.role ?? 'unknown',
            action: 'dissemination_live_whatsapp_failed',
            entity: 'alert_candidate',
            entity_id: alertId,
            detail: {
              twilio_sid: result.sid,
              twilio_status: result.status,
              error_code: result.errorCode,
              error_message: result.errorMessage,
              to: getWhatsAppTo(),
              used_template: Boolean(contentSid),
              body_preview: body.slice(0, 120),
            },
          })
          errorMessage = explainTwilioWhatsAppFailure(result)
        } else {
          await fanOutAlert(supabase, alertId, districtId, 'live')
          await markChannelSent(supabase, alertId, channel)

          await logAudit(supabase, {
            actor: user.id,
            actor_role: profile?.role ?? 'unknown',
            action: channel === 'whatsapp' ? 'dissemination_live_whatsapp' : 'dissemination_live_sms',
            entity: 'alert_candidate',
            entity_id: alertId,
            detail: {
              mode: 'live',
              channel,
              twilio_sid: result.sid,
              twilio_status: result.status,
              to: channel === 'whatsapp' ? getWhatsAppTo() : process.env.TWILIO_TO_NUMBER,
              used_template: Boolean(contentSid),
              body_chars: body.length,
            },
          })

          okChannel = channel
        }
      }
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err)
  }

  revalidatePath(`/${locale}/dashboard/alerts/${alertId}/dissemination`)

  if (okChannel) {
    redirect(disseminationPath(locale, alertId, { ok: okChannel }))
  }

  redirect(
    disseminationPath(locale, alertId, {
      error: errorMessage ?? 'Live dispatch failed',
    })
  )
}

/** @deprecated use executeDryRunDispatch */
export async function sendDryRunDissemination(alertId: string, districtId: string) {
  return executeDryRunDispatch(alertId, districtId, 'en')
}
