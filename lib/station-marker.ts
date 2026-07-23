/** Status colors for field-station map markers. */
export const STATION_STATUS_DOT: Record<string, string> = {
  online: '#0F6B3D',
  degraded: '#E0A030',
  offline: '#B3261E',
}

function statusDotColor(status: string | null | undefined): string {
  return STATION_STATUS_DOT[status ?? ''] ?? '#888888'
}

/**
 * Grid / AWS-style station marker SVG.
 * Mast + antenna grid panel, with a small status LED (green / yellow / red).
 */
export function stationMarkerSvg(status: string | null | undefined): string {
  const dot = statusDotColor(status)
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs>
    <filter id="shadow" x="-20%" y="-10%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-opacity="0.35"/>
    </filter>
  </defs>
  <!-- Pin body -->
  <path d="M32 58 L18 40 Q12 32 12 24 A20 20 0 1 1 52 24 Q52 32 46 40 Z"
        fill="#F7F7F4" stroke="#14231A" stroke-width="2" filter="url(#shadow)"/>
  <!-- Antenna mast -->
  <rect x="30" y="22" width="4" height="18" rx="1" fill="#14231A"/>
  <!-- Grid panel (station sensor head) -->
  <rect x="20" y="12" width="24" height="14" rx="2" fill="#01411C" stroke="#14231A" stroke-width="1.5"/>
  <path d="M24 12 V26 M28 12 V26 M32 12 V26 M36 12 V26 M40 12 V26
           M20 16 H44 M20 20 H44 M20 24 H44"
        stroke="#FAFAF8" stroke-width="1" opacity="0.85"/>
  <!-- Cross-arm -->
  <rect x="22" y="20" width="20" height="3" rx="1" fill="#0F6B3D"/>
  <!-- Status LED -->
  <circle cx="44" cy="38" r="6" fill="${dot}" stroke="#FFFFFF" stroke-width="2"/>
</svg>`.trim()
}

export function stationMarkerDataUrl(status: string | null | undefined): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(stationMarkerSvg(status))}`
}

/** Compact icon for map legends (grid panel + status dot). */
export function stationLegendSvg(status: string = 'online'): string {
  const dot = statusDotColor(status)
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
  <rect x="2" y="1" width="10" height="6" rx="1" fill="#01411C"/>
  <path d="M4 1 V7 M6 1 V7 M8 1 V7 M10 1 V7 M2 3 H12 M2 5 H12" stroke="#FAFAF8" stroke-width="0.7" opacity="0.9"/>
  <rect x="6" y="7" width="2" height="4" fill="#14231A"/>
  <circle cx="11" cy="11" r="2.5" fill="${dot}" stroke="#fff" stroke-width="0.8"/>
</svg>`.trim()
}
