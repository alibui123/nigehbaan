import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'

export default async function SourceHealthFooter() {
  const t = await getTranslations('Dashboard')
  const supabase = await createClient()
  const { data: sources } = await supabase
    .from('ingest_status')
    .select('source, status, last_success_at')
    .order('source')

  if (!sources || sources.length === 0) return null

  return (
    <div className="flex items-center gap-2.5 overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-4 sm:px-6 sm:py-2 [&::-webkit-scrollbar]:hidden">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink)]/35">
        {t('dataFeeds')}
      </span>
      {sources.map((s) => (
        <span
          key={s.source}
          className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--color-base)] px-2 py-0.5 font-mono text-[11px] text-[var(--color-ink)]/65"
        >
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              s.status === 'ok'
                ? 'bg-[var(--color-ok)]'
                : s.status === 'degraded'
                  ? 'bg-[var(--color-warn)]'
                  : 'bg-[var(--color-emergency)]'
            }`}
          />
          {s.source === 'pmd_ffd' ? 'PMD FFD' : s.source}
          {s.last_success_at && (
            <span className="hidden text-[var(--color-ink)]/40 min-[420px]:inline">
              {new Date(s.last_success_at).toLocaleTimeString('en-GB', {
                timeZone: 'Asia/Karachi',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
        </span>
      ))}
    </div>
  )
}
