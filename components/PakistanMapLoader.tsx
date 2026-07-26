'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

const MAP_SRC = '/pakistan-map.png'
const FILL_GREEN = '#0F6B3D'

type PakistanMapLoaderProps = {
  /** Optional controlled progress 0–100. When omitted, animates while mounted. */
  progress?: number
  label?: string
  className?: string
  /** Compact variant for inline / map placeholders */
  size?: 'full' | 'compact'
}

/**
 * Pakistan map loading screen — green fill rises from bottom to top with progress.
 * Fill + leading edge are transform-driven (no CSS transitions) so they stay locked together.
 */
export default function PakistanMapLoader({
  progress: controlledProgress,
  label,
  className = '',
  size = 'full',
}: PakistanMapLoaderProps) {
  const t = useTranslations('Common')
  const [autoProgress, setAutoProgress] = useState(0)
  const progress = Math.max(0, Math.min(100, controlledProgress ?? autoProgress))
  const pct = Math.round(progress)
  // scaleY 0–1 from the bottom; line sits on the fill front
  const fill = progress / 100

  useEffect(() => {
    if (controlledProgress != null) return

    let frame = 0
    const start = performance.now()

    const tick = (now: number) => {
      const elapsed = (now - start) / 1000
      const next = Math.min(90, 100 * (1 - Math.exp(-elapsed / 1.35)))
      setAutoProgress(next)
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [controlledProgress])

  const mapWidth = size === 'compact' ? 'w-36 sm:w-44' : 'w-48 sm:w-56 md:w-64'
  const displayLabel = label ?? t('loading')

  const content = (
    <div className={`flex flex-col items-center gap-5 ${className}`}>
      <div className={`relative ${mapWidth}`}>
        <img
          src={MAP_SRC}
          alt=""
          width={512}
          height={640}
          draggable={false}
          decoding="async"
          className="block h-auto w-full select-none"
        />

        {/* Green fill — scale from bottom (GPU-friendly, no clip-path lag) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 origin-bottom will-change-transform"
          style={{
            backgroundColor: FILL_GREEN,
            mixBlendMode: 'multiply',
            transform: `scaleY(${fill})`,
          }}
        />

        {/* Leading edge — full-height carrier so % translate matches the fill */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 will-change-transform"
          style={{ transform: `translate3d(0, ${(1 - fill) * 100}%, 0)` }}
        >
          <div className="h-px w-full bg-emerald-300/90 shadow-[0_0_10px_1px_rgba(52,211,153,0.5)]" />
        </div>
      </div>

      <div className="flex flex-col items-center gap-1.5 text-center">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400/90">
          {t('brand')}
        </p>
        <p className="text-sm text-white/70">{displayLabel}</p>
        <p className="font-mono text-lg font-semibold tabular-nums text-white">{pct}%</p>
      </div>
    </div>
  )

  if (size === 'compact') {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="flex h-full min-h-[12rem] w-full items-center justify-center bg-black p-4"
      >
        {content}
      </div>
    )
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="flex min-h-dvh w-full items-center justify-center bg-black px-6"
    >
      {content}
    </div>
  )
}
