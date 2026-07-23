'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

type LanguageToggleProps = {
  currentLocale: string
  /** Compact control for headers; default is floating FAB */
  variant?: 'floating' | 'header'
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
    const segments = pathname.split('/')
    segments[1] = locale
    router.push(segments.join('/') || `/${locale}`)
  }

  // Pages that already show a header toggle — skip the floating FAB.
  if (
    variant === 'floating' &&
    (/\/(en|ur)\/dashboard\/?$/.test(pathname) || /\/(en|ur)\/login/.test(pathname))
  ) {
    return null
  }

  const shell =
    variant === 'floating'
      ? 'fixed bottom-4 end-4 z-50 shadow-lg'
      : 'shadow-sm'

  // On light backgrounds (login), use a light shell so the control stays visible.
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
      className={`${shell} ${palette} inline-flex overflow-hidden rounded-full p-0.5 text-sm font-medium`}
    >
      <button
        type="button"
        onClick={() => switchTo('en')}
        aria-pressed={currentLocale === 'en'}
        className={`rounded-full px-3 py-1.5 transition-colors ${
          currentLocale === 'en' ? active : idle
        }`}
      >
        {t('english')}
      </button>
      <button
        type="button"
        onClick={() => switchTo('ur')}
        aria-pressed={currentLocale === 'ur'}
        className={`rounded-full px-3 py-1.5 font-[family-name:var(--font-urdu)] transition-colors ${
          currentLocale === 'ur' ? active : idle
        }`}
      >
        {t('urdu')}
      </button>
    </div>
  )
}
