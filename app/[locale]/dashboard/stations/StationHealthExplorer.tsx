'use client'

import { useCallback, useState, type ReactNode } from 'react'
import StationHealthRollup from './StationHealthRollup'
import StationHealthClient from './StationHealthClient'
import type { StationHealthRow } from '@/lib/station-health'

interface MaintenanceTicket {
  id: string
  station_id: string | null
  reason: string
  status: string
  created_at: string | null
  station_name?: string
}

interface StationHealthExplorerProps {
  stations: StationHealthRow[]
  openTicketCount: number
  tickets: MaintenanceTicket[]
  map: ReactNode
}

/**
 * NEW FILE. Thin client wrapper so the Valley/District rollup tables and the
 * station list can share filter state — they were rendered as unconnected
 * siblings in page.tsx before. Holds ONLY the location filter
 * (selectedValley / selectedDistrict). Status filter, Grid/Table view, and
 * the explorer's expanded/collapsed state stay local to StationHealthClient
 * — nothing else needs them, so no reason to lift them here.
 *
 * No Supabase calls, no new fetches: `stations`, `openTicketCount`, and
 * `tickets` are exactly what page.tsx already computed and previously
 * passed straight into StationHealthRollup / StationHealthClient.
 */
export default function StationHealthExplorer({
  stations,
  openTicketCount,
  tickets,
  map,
}: StationHealthExplorerProps) {
  const [selectedValley, setSelectedValley] = useState<string | null>(null)
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null)

  // Task 1
  const handleSelectValley = useCallback((valley: string) => {
    setSelectedValley((current) => (current === valley ? null : valley))
    setSelectedDistrict(null) // Task 2: only one location filter active at a time
  }, [])

  // Task 2
  const handleSelectDistrict = useCallback((district: string) => {
    setSelectedDistrict((current) => (current === district ? null : district))
    setSelectedValley(null)
  }, [])

  const clearLocationFilters = useCallback(() => {
    setSelectedValley(null)
    setSelectedDistrict(null)
  }, [])

  return (
    <div className="space-y-4 sm:space-y-6">
      <StationHealthRollup
        stations={stations}
        openTicketCount={openTicketCount}
        selectedValley={selectedValley}
        selectedDistrict={selectedDistrict}
        onSelectValley={handleSelectValley}
        onSelectDistrict={handleSelectDistrict}
      />

      {map}

      <StationHealthClient
        stations={stations}
        tickets={tickets}
        selectedValley={selectedValley}
        selectedDistrict={selectedDistrict}
        onClearLocationFilters={clearLocationFilters}
      />
    </div>
  )
}
