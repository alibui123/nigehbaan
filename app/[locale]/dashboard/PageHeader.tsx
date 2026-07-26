import Link from 'next/link'
import LanguageToggle from '../LanguageToggle'

type PageHeaderProps = {
  locale: string
  title: string
  subtitle?: string
  backHref?: string
  backLabel?: string
  /** Optional trailing slot (role badge, actions, etc.) */
  trailing?: React.ReactNode
  /** Hide language toggle when the page already has one elsewhere */
  showLanguage?: boolean
}

/**
 * Shared dashboard page chrome. Compact on mobile (thumb-friendly back + title),
 * fuller on desktop. Bottom-nav spacing is handled by the page body classes.
 */
export default function PageHeader({
  locale,
  title,
  subtitle,
  backHref,
  backLabel = '←',
  trailing,
  showLanguage = true,
}: PageHeaderProps) {
  const back = backHref ?? `/${locale}/dashboard`

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-primary)] px-3 py-2.5 sm:px-6 sm:py-3">
      <div className="flex items-center gap-2.5 sm:gap-4">
        <Link
          href={back}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/15 active:bg-white/20 sm:h-auto sm:w-auto sm:rounded-md sm:bg-transparent sm:px-0 sm:py-0 sm:text-sm sm:text-white/70 sm:hover:bg-transparent sm:hover:text-white"
          aria-label={backLabel}
        >
          <span className="sm:hidden rtl:rotate-180" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </span>
          <span className="hidden sm:inline">{backLabel}</span>
        </Link>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-white sm:text-lg">{title}</h1>
          {subtitle && (
            <p className="hidden truncate text-sm text-white/70 sm:block">{subtitle}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {showLanguage && <LanguageToggle currentLocale={locale} variant="header" />}
          {trailing}
        </div>
      </div>
      {subtitle && (
        <p className="mt-1 truncate ps-11 text-xs text-white/65 sm:hidden">{subtitle}</p>
      )}
    </header>
  )
}
