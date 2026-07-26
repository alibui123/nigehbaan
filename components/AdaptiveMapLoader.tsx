'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import PakistanMapLoader from '@/components/PakistanMapLoader'
import { useAdaptiveProgress } from '@/components/useAdaptiveProgress'

type AdaptiveMapLoaderProps = {
  /** True when the underlying route/data is ready — animation then races to 100. */
  ready: boolean
  onFinished?: () => void
  label?: string
  className?: string
}

/**
 * Pakistan map fill that always plays 0→100. Speed adapts to how soon `ready` flips.
 */
export default function AdaptiveMapLoader({
  ready,
  onFinished,
  label,
  className,
}: AdaptiveMapLoaderProps) {
  const t = useTranslations('Common')
  const { progress, finished } = useAdaptiveProgress(ready)
  const onFinishedRef = useRef(onFinished)
  onFinishedRef.current = onFinished

  useEffect(() => {
    if (!finished) return
    onFinishedRef.current?.()
  }, [finished])

  return (
    <div className={className ?? 'fixed inset-0 z-[200] bg-black'}>
      <PakistanMapLoader progress={progress} label={label ?? t('loadingMap')} />
    </div>
  )
}
