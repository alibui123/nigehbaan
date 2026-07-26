import type { SupabaseClient } from '@supabase/supabase-js'
import { formatAuditTimestamp, type AuditLogRow } from '@/lib/audit'

export interface DeliveryStats {
  total: number
  queued: number
  sent: number
  delivered: number
  acknowledged: number
  failed: number
  ackRate: number
  estimatedReach: number
}

export interface PostEventReportData {
  alert: Record<string, unknown>
  districtName: string | null
  province: string | null
  issuerName: string | null
  auditLogs: AuditLogRow[]
  deliveryStats: DeliveryStats | null
  channels: { channel: string; recipient_count: number }[]
  generatedAt: string
  /** Short reference for filenames / cover (first 8 of UUID). */
  shortRef: string
  lifecycle: {
    detectedAt: string | null
    issuedAt: string | null
    firstDispatchAt: string | null
    firstAckAt: string | null
  }
}

export async function loadPostEventReport(
  supabase: SupabaseClient,
  alertId: string
): Promise<PostEventReportData | null> {
  const { data: alert } = await supabase
    .from('alert_candidate')
    .select('*, district:district_id(name_en, province)')
    .eq('id', alertId)
    .single()

  if (!alert) return null

  const districtId = alert.district_id as string | null

  const [{ data: auditLogs }, { data: deliveries }, { data: channels }] = await Promise.all([
    supabase.from('audit_log').select('*').eq('entity_id', alertId).order('at', { ascending: true }),
    supabase.from('alert_delivery').select('status').eq('alert_id', alertId),
    districtId
      ? supabase.from('channel_recipient_count').select('channel, recipient_count').eq('district_id', districtId)
      : Promise.resolve({ data: [] as { channel: string; recipient_count: number }[] }),
  ])

  let issuerName: string | null = null
  if (alert.issued_by) {
    const { data: issuer } = await supabase
      .from('profile')
      .select('full_name')
      .eq('id', alert.issued_by)
      .single()
    issuerName = issuer?.full_name ?? null
  }

  let deliveryStats: DeliveryStats | null = null
  if (deliveries && deliveries.length > 0) {
    const stats = {
      total: deliveries.length,
      queued: deliveries.filter((d) => d.status === 'queued').length,
      sent: deliveries.filter((d) => d.status === 'sent').length,
      delivered: deliveries.filter((d) => d.status === 'delivered').length,
      acknowledged: deliveries.filter((d) => d.status === 'acknowledged').length,
      failed: deliveries.filter((d) => d.status === 'failed').length,
    }
    const ackRate =
      stats.total > 0 ? Math.round((stats.acknowledged / stats.total) * 100) : 0
    deliveryStats = {
      ...stats,
      ackRate,
      estimatedReach: (channels ?? []).reduce((s, c) => s + Number(c.recipient_count || 0), 0),
    }
  }

  const logs = (auditLogs ?? []) as AuditLogRow[]
  const firstOf = (actions: string[]) =>
    logs.find((l) => actions.includes(l.action))?.at ?? null

  const district = alert.district as { name_en?: string; province?: string } | null

  return {
    alert,
    districtName: district?.name_en ?? null,
    province: district?.province ?? null,
    issuerName,
    auditLogs: logs,
    deliveryStats,
    channels: channels ?? [],
    generatedAt: formatAuditTimestamp(new Date().toISOString()),
    shortRef: alertId.replace(/-/g, '').slice(0, 8).toUpperCase(),
    lifecycle: {
      detectedAt: (alert.created_at as string) ?? firstOf(['rule_fired', 'candidate_created']),
      issuedAt: (alert.issued_at as string) ?? null,
      firstDispatchAt: firstOf([
        'dissemination_fanout_on_issue',
        'dissemination_dry_run_started',
        'dissemination_live_sms',
        'dissemination_live_whatsapp',
      ]),
      firstAckAt: firstOf(['acknowledgement_received']),
    },
  }
}

export function reportHeadline(data: PostEventReportData): string {
  const a = data.alert
  return (a.headline_en as string) || (a.event_en as string) || (a.title as string) || 'Alert'
}

export function reportFilename(data: PostEventReportData): string {
  const district = (data.districtName ?? 'Provincial').replace(/[^a-zA-Z0-9]+/g, '_')
  const day = new Date().toISOString().slice(0, 10)
  return `Nigheban_PostEvent_${district}_${data.shortRef}_${day}.pdf`
}

export function severityTone(severity: string | null | undefined): { bg: string; fg: string; border: string } {
  const s = (severity ?? '').toLowerCase()
  if (s === 'extreme' || s === 'severe') {
    return { bg: '#fef2f2', fg: '#991b1b', border: '#dc2626' }
  }
  if (s === 'moderate') {
    return { bg: '#fff7ed', fg: '#9a3412', border: '#ea580c' }
  }
  if (s === 'minor') {
    return { bg: '#fffbeb', fg: '#92400e', border: '#d97706' }
  }
  return { bg: '#f8fafc', fg: '#334155', border: '#64748b' }
}
