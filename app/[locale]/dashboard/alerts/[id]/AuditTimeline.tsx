import Link from 'next/link'
import {
  actionLabel,
  formatAuditTimestamp,
  formatDetail,
  type AuditLogRow,
} from '@/lib/audit'

export default function AuditTimeline({
  logs,
  actorNames,
  locale,
  deliveryStats,
}: {
  logs: AuditLogRow[]
  actorNames: Record<string, string>
  locale: string
  deliveryStats?: {
    total: number
    acknowledged: number
    ackRate?: number
  } | null
}) {
  if (logs.length === 0) return null

  return (
    <div
      dir="ltr"
      lang="en"
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 font-sans leading-normal sm:p-5"
    >
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">
        Audit Timeline
      </h2>
      <ol className="relative ms-1 space-y-0 border-s-2 border-[var(--color-primary)]/30 ps-6">
        {logs.map((log, i) => {
          const actor =
            log.actor && actorNames[log.actor]
              ? actorNames[log.actor]
              : log.actor_role?.toUpperCase() || 'SYSTEM'
          const detail = formatDetail(log.detail)
          const isLast = i === logs.length - 1

          return (
            <li key={log.id} className={`relative min-w-0 pb-6 ${isLast ? 'pb-0' : ''}`}>
              <span className="absolute -start-[1.65rem] top-1.5 flex h-3 w-3 rounded-full border-2 border-white bg-[var(--color-primary)]" />
              <div className="min-w-0 overflow-hidden rounded border border-[var(--color-border)] bg-white p-3 shadow-sm">
                <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 break-words font-semibold leading-snug text-[var(--color-ink)]">
                    {actionLabel(log.action)}
                  </span>
                  <span className="shrink-0 font-mono text-xs leading-normal text-[var(--color-ink)]/50">
                    {formatAuditTimestamp(log.at)}
                  </span>
                </div>
                <p className="text-sm leading-snug text-[var(--color-ink)]/70">
                  Actor: <span className="font-semibold">{actor}</span>
                </p>
                {detail && (
                  <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-all rounded bg-[var(--color-base)] px-2 py-1.5 font-mono text-[10px] leading-relaxed text-[var(--color-ink)]/55">
                    {detail}
                  </pre>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {deliveryStats && deliveryStats.total > 0 && (
        <p className="mt-4 border-t border-[var(--color-border)] pt-3 text-xs leading-snug text-[var(--color-ink)]/60">
          Dissemination: {deliveryStats.total} delivery rows · {deliveryStats.acknowledged}{' '}
          acknowledged
          {deliveryStats.ackRate != null && ` (${deliveryStats.ackRate}% ack rate)`}
        </p>
      )}

      <Link
        href={`/${locale}/dashboard/audit?entity=alert_candidate&entity_id=${logs[0]?.entity_id ?? ''}`}
        className="mt-3 inline-block text-xs text-[var(--color-primary)] hover:underline"
      >
        View in global audit log →
      </Link>
    </div>
  )
}
