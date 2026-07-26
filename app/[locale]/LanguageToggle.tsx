'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

type LanguageToggleProps = {
  currentLocale: string
  /** Compact control for headers; default is floating FAB */
  variant?: 'floating' | 'header'
}

const LOCALE_RE = /^\/(en|ur)(?=\/|$)/

/**
 * Swap the leading /en|ur segment on the real browser path.
 * Do not rely on usePathname() alone — with next-intl it can omit the locale
 * prefix, which turned "/dashboard" into "/ur" and bounced users to login.
 */
function pathForLocale(nextLocale: string, pathnameFromHook: string): string {
  const raw =
    typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`
      : pathnameFromHook

  if (LOCALE_RE.test(raw)) {
    return raw.replace(LOCALE_RE, `/${nextLocale}`)
  }

  // Hook pathname without locale (e.g. "/dashboard" or "/dashboard/alerts")
  const normalized = pathnameFromHook.startsWith('/')
    ? pathnameFromHook
    : `/${pathnameFromHook}`
  if (normalized === '/' || normalized === '') {
    return `/${nextLocale}/dashboard`
  }
  return `/${nextLocale}${normalized}`
}

export default function LanguageToggle({
  currentLocale,
  variant = 'floating',
}: LanguageToggleProps) {
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations('Common')

  function switchTo(locale: string) {
    if (locale === currentLocale) return
    router.replace(pathForLocale(locale, pathname))
  }

  const shell =
    variant === 'floating'
      ? 'fixed bottom-4 end-4 z-50 shadow-lg'
      : 'shadow-sm'

  const onLight = variant === 'header' && /\/(en|ur)\/login/.test(pathname)
  const palette = onLight
    ? 'border border-[var(--color-border)] bg-[var(--color-surface)]'
    : 'border border-white/25 bg-[var(--color-primary)]'

  const active = onLight
    ? 'bg-[var(--color-primary)] text-white'
    : 'bg-white text-[var(--color-primary)]'

  const idle = onLight
    ? 'text-[var(--color-ink)]/70 hover:text-[var(--color-ink)]'
    : 'text-white/80 hover:text-white'

  return (
    <div
      role="group"
      aria-label={t('switchLanguage')}
      className={`${shell} ${palette} inline-flex overflow-hidden rounded-full p-0.5 text-xs font-medium sm:text-sm`}
    >
      <button
        type="button"
        onClick={() => switchTo('en')}
        aria-pressed={currentLocale === 'en'}
        className={`rounded-full px-2.5 py-1 transition-colors sm:px-3 sm:py-1.5 ${
          currentLocale === 'en' ? active : idle
        }`}
      >
        {t('english')}
      </button>
      <button
        type="button"
        onClick={() => switchTo('ur')}
        aria-pressed={currentLocale === 'ur'}
        className={`rounded-full px-2.5 py-1 font-[family-name:var(--font-urdu)] transition-colors sm:px-3 sm:py-1.5 ${
          currentLocale === 'ur' ? active : idle
        }`}
      >
        {t('urdu')}
      </button>
    </div>
  )
}
