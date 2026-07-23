// app/api/flood-forecast/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { enrichDistrictNameUr } from '@/lib/localized'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase.from('district_flood_risk_geojson').select('*')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const features = (data ?? [])
    .filter((d) => d.geometry_json)
    .map((d) => {
      const name_ur = enrichDistrictNameUr(d.name_en, d.name_ur)
      return {
        type: 'Feature',
        geometry: JSON.parse(d.geometry_json),
        properties: {
          district_id: d.district_id,
          name_en: d.name_en,
          name_ur,
          display_name_en: d.name_en,
          display_name_ur: name_ur ?? d.name_en,
          risk_level: d.risk_level ?? 'unknown',
          forecast_date: d.forecast_date,
          river_discharge: d.river_discharge,
        },
      }
    })

  return NextResponse.json({ type: 'FeatureCollection', features }, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
  })
}
