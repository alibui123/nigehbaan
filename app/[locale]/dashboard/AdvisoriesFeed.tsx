import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { districtDisplayName, provinceDisplayName } from '@/lib/localized'

export default async function AdvisoriesFeed() {
  const supabase = await createClient()
  const locale = await getLocale()
  const t = await getTranslations('Data')

  const { data: advisories, error } = await supabase
    .from('advisory')
    .select('*, district:district_id(id, name_en, name_ur, province)')
    .order('issued_at', { ascending: false })
    .limit(10)

  if (error) {
    console.error('Error fetching advisories:', error)
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {!advisories || advisories.length === 0 ? (
        <p className="text-sm text-[var(--color-ink)]/50">{t('feeds.noAdvisories')}</p>
      ) : (
        <div className="space-y-4">
          {advisories.map((a) => (
            <div key={a.id} className="rounded-lg border border-[var(--color-border)] p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-[var(--color-ink)]/50">
                  {a.source}
                </span>
                <span className="text-[10px] text-[var(--color-ink)]/40">
                  {new Date(a.issued_at).toLocaleDateString(locale === 'ur' ? 'ur-PK' : 'en-GB', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <h3 className="mb-1 text-sm font-medium leading-tight text-[var(--color-ink)]">
                {a.title}
              </h3>
              {a.body && (
                <p className="mb-2 line-clamp-3 text-xs text-[var(--color-ink)]/70">
                  {a.body}
                </p>
              )}
              {a.district && (
                <Link
                  href={`/${locale}/dashboard/district/${a.district.id}`}
                  className="mt-2 inline-block text-[11px] font-medium text-[var(--color-primary)] hover:underline"
                >
                  {districtDisplayName(locale, a.district.name_en, a.district.name_ur)},{' '}
                  {provinceDisplayName(locale, a.district.province)} →
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
