'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { signOut } from '@/app/[locale]/login/actions'

type LogoutButtonProps = {
  locale: string
  variant?: 'menu' | 'header' | 'drawer'
  className?: string
  onSignOut?: () => void
}

function IconLogout({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

export default function LogoutButton({
  locale,
  variant = 'menu',
  className = '',
  onSignOut,
}: LogoutButtonProps) {
  const t = useTranslations('Dashboard')
  const [isPending, startTransition] = useTransition()

  const handleLogout = () => {
    onSignOut?.()
    startTransition(async () => {
      await signOut(locale)
    })
  }

  if (variant === 'header') {
    return (
      <button
        type="button"
        onClick={handleLogout}
        disabled={isPending}
        title={t('logout')}
        aria-label={t('logout')}
        className={`group flex h-8 items-center gap-1.5 rounded-lg bg-white/10 px-2.5 text-xs font-semibold text-white transition-colors hover:bg-white/20 active:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-50 ${className}`}
      >
        <IconLogout className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
        <span className="hidden sm:inline">{isPending ? '…' : t('logout')}</span>
      </button>
    )
  }

  if (variant === 'drawer') {
    return (
      <button
        type="button"
        onClick={handleLogout}
        disabled={isPending}
        className={`flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-[var(--color-emergency)] transition-colors hover:bg-red-100 active:bg-red-200 focus:outline-none disabled:opacity-50 ${className}`}
      >
        <IconLogout className="h-4 w-4 shrink-0" />
        <span>{isPending ? '…' : t('logout')}</span>
      </button>
    )
  }

  // default 'menu' (for NavMenu desktop command dropdown)
  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isPending}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 active:bg-red-100 focus:outline-none disabled:opacity-50 ${className}`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-red-50 text-[var(--color-emergency)]">
        <IconLogout className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-start">{isPending ? '…' : t('logout')}</span>
    </button>
  )
}
