'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Visual 0→100 that always starts at 0.
 * While waiting, eases toward ~93%. When `contentReady` becomes true,
 * finishes the remainder quickly — overall faster when the page was fast.
 *
 * Progress state updates are coalesced (~every other frame / 0.35%) to cut
 * React re-render cost while the motion still reads as continuous.
 */
export function useAdaptiveProgress(contentReady: boolean) {
  const [progress, setProgress] = useState(0)
  const [finished, setFinished] = useState(false)

  const contentReadyRef = useRef(contentReady)
  contentReadyRef.current = contentReady

  useEffect(() => {
    const start = performance.now()
    let progressValue = 0
    let readyAt: number | null = null
    let freeze = 0
    let raf = 0
    let stopped = false
    let lastPublished = -1
    let frame = 0

    const publish = (next: number, force = false) => {
      progressValue = next
      if (!force && frame % 2 !== 0 && Math.abs(next - lastPublished) < 0.35) return
      lastPublished = next
      setProgress(next)
    }

    const tick = (now: number) => {
      if (stopped) return
      frame += 1

      if (contentReadyRef.current && readyAt == null) {
        readyAt = now
        freeze = progressValue
      }

      let next: number

      if (readyAt == null) {
        const elapsed = (now - start) / 1000
        next = 93 * (1 - Math.exp(-elapsed / 1.55))
      } else {
        const finishElapsed = (now - readyAt) / 1000
        const duration = Math.max(0.22, Math.min(0.55, (100 - freeze) / 180 + 0.2))
        const t = Math.min(1, finishElapsed / duration)
        const eased = 1 - (1 - t) ** 3
        next = freeze + (100 - freeze) * eased
      }

      if (readyAt != null && next >= 99.5) {
        publish(100, true)
        setFinished(true)
        return
      }

      publish(next)
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
    }
  }, [])

  return { progress, finished }
}
