import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { buildAuditQuery, ACTION_LABELS } from '@/lib/audit'
import AuditLogTable from './AuditLogTable'
import PageHeader from '../PageHeader'

export const dynamic = 'force-dynamic'

export default async function AuditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{
    q?: string
    action?: string
    entity?: string
    entity_id?: string
    actor_role?: string
    from?: string
    to?: string
    page?: string
  }>
}) {
  const { locale } = await params
  const t = await getTranslations('Audit')
  const tc = await getTranslations('Common')
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect(`/${locale}/login`)

  const page = Math.max(parseInt(sp.page ?? '1', 10) || 1, 1)
  const filters = {
    q: sp.q,
    action: sp.action,
    entity: sp.entity,
    entityId: sp.entity_id,
    actorRole: sp.actor_role,
    from: sp.from,
    to: sp.to,
    page,
    limit: 50,
  }

  const { data: logs, error, count } = await buildAuditQuery(supabase, filters)
  const totalPages = count ? Math.ceil(count / filters.limit) : 1

  const filterDefaults = {
    q: sp.q ?? '',
    action: sp.action ?? '',
    entity: sp.entity ?? '',
    entity_id: sp.entity_id ?? '',
    actor_role: sp.actor_role ?? '',
    from: sp.from ?? '',
    to: sp.to ?? '',
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-base)]">
      <PageHeader
        locale={locale}
        title={t('title')}
        backLabel={tc('backToOverview')}
        trailing={
          count != null ? (
            <span className="rounded-full bg-white/10 px-2.5 py-1 font-mono text-[10px] text-white sm:text-xs">
              {t('entries', { count: count.toLocaleString() })}
            </span>
          ) : undefined
        }
      />

      <div className="dashboard-page-body flex-1 overflow-auto px-3 pt-4 sm:px-6 sm:pt-6">
        <div className="mx-auto max-w-6xl">
          <AuditLogTable
            locale={locale}
            logs={logs ?? []}
            error={error?.message}
            filterDefaults={filterDefaults}
            page={page}
            totalPages={totalPages}
            actionOptions={Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </div>
      </div>
    </div>
  )
}
