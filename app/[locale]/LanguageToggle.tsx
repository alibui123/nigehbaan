'use client'

import { usePathname, useRouter } from 'next/navigation'

export default function LanguageToggle({ currentLocale }: { currentLocale: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const otherLocale = currentLocale === 'en' ? 'ur' : 'en'

  function switchLocale() {
    const segments = pathname.split('/')
    segments[1] = otherLocale
    router.push(segments.join('/'))
  }

  return (
    <button
      onClick={switchLocale}
      aria-label="Switch language"
      className="fixed bottom-4 right-4 z-50 rounded-full border border-[var(--color-border)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-[var(--color-primary)]/90"
    >
      {otherLocale === 'ur' ? 'اردو' : 'EN'}
    </button>
  )
}