import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { fetchPmdFfdSnapshot, legacyJsonToRivers } from '@/lib/ingest/pmd-fetch'
import { normalizeFloodLevel, resolveGaugeCoord } from '@/lib/pmd/rivers'

export const dynamic = 'force-dynamic'

/** GeoJSON of PMD FFD river gauge status for map layer S3. */
export async function GET() {
  try {
    const supabase = await createClient()

    let rivers: ReturnType<typeof legacyJsonToRivers> = []
    try {
      const { data } = await supabase
        .from('pmd_forecasts')
        .select('rivers')
        .order('fetched_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      rivers = legacyJsonToRivers(data?.rivers)
    } catch {
      rivers = []
    }

    if (rivers.length === 0) {
      try {
        const live = await fetchPmdFfdSnapshot()
        rivers = live.rivers
      } catch {
        return NextResponse.json({ type: 'FeatureCollection', features: [] })
      }
    }

    const features = rivers
      .map((r) => {
        const liveCoord =
          r.lat != null && r.lon != null && Number.isFinite(r.lat) && Number.isFinite(r.lon)
            ? { lat: r.lat, lon: r.lon, label: r.location ? `${r.name} at ${r.location}` : r.name }
            : null
        const coord = liveCoord ?? resolveGaugeCoord(r.name, r.location)
        if (!coord) return null
        const level = normalizeFloodLevel(r.flood_level)
        return {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [coord.lon, coord.lat] },
          properties: {
            name: coord.label,
            river: r.name,
            location: r.location,
            discharge_cusecs: r.flow_cusecs,
            ffd_risk: r.flood_level ?? level,
            flood_level: level,
            source: 'pmd_ffd',
          },
        }
      })
      .filter(Boolean)

    return NextResponse.json({
      type: 'FeatureCollection',
      features,
    })
  } catch (error) {
    console.error('Error in /api/pmd/river-flows:', error)
    return NextResponse.json({ type: 'FeatureCollection', features: [] })
  }
}
