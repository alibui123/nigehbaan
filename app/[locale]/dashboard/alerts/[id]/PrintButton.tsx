'use client'

import { useState } from 'react'

export default function PrintButton({
  alertId,
  locale,
  disabled,
}: {
  alertId: string
  locale: string
  disabled?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDownload = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/report/generate?alertId=${encodeURIComponent(alertId)}&locale=${encodeURIComponent(locale)}`,
        { credentials: 'same-origin' }
      )
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || `PDF failed (${res.status})`)
      }
      const blob = await res.blob()
      const cd = res.headers.get('Content-Disposition') || ''
      const match = cd.match(/filename="([^"]+)"/)
      const filename = match?.[1] || `Nigheban_PostEvent_${alertId.slice(0, 8)}.pdf`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="print:hidden flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void handleDownload()}
        disabled={disabled || busy}
        className="rounded border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-ink)] hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:py-2 sm:text-sm"
      >
        {busy ? 'Generating…' : 'Download Post-Event PDF'}
      </button>
      {error && <p className="max-w-[14rem] text-right text-[10px] text-red-600">{error}</p>}
    </div>
  )
}
