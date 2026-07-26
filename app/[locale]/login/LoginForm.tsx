'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import SubmitButton from './SubmitButton'

interface LoginFormProps {
  error?: string
  action: (formData: FormData) => void
}

export default function LoginForm({ error, action }: LoginFormProps) {
  const [showPassword, setShowPassword] = useState(false)
  const t = useTranslations('Login')
  const locale = useLocale()
  const isUrdu = locale === 'ur'

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
      <form action={action} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className={`mb-1.5 block text-sm font-medium text-[var(--color-ink)] ${
              isUrdu ? 'text-end font-[family-name:var(--font-urdu)]' : 'text-start'
            }`}
          >
            {t('email')}
          </label>
          {/* LTR isolate: email stays left-to-right without breaking RTL label layout */}
          <div dir="ltr" className="w-full">
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-left text-sm outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]"
              placeholder="you@nigheban.gov.pk"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="password"
            className={`mb-1.5 block text-sm font-medium text-[var(--color-ink)] ${
              isUrdu ? 'text-end font-[family-name:var(--font-urdu)]' : 'text-start'
            }`}
          >
            {t('password')}
          </label>
          {/* Whole control is LTR so pe-* padding and the eye icon share the same side */}
          <div className="relative w-full" dir="ltr">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-[var(--color-border)] py-2 ps-3 pe-10 text-left text-sm outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--color-ink)]/50 transition-colors hover:text-[var(--color-ink)]"
              aria-label={showPassword ? t('hidePassword') : t('showPassword')}
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {error && (
          <p
            className={`rounded-md bg-[var(--color-emergency)]/10 px-3 py-2 text-sm text-[var(--color-emergency)] ${
              isUrdu ? 'text-end font-[family-name:var(--font-urdu)]' : 'text-start'
            }`}
          >
            {error}
          </p>
        )}

        <SubmitButton />
      </form>
    </div>
  )
}
