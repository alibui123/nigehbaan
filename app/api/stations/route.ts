// app/api/stations/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { enrichDistrictNameUr } from '@/lib/localized'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('station_health')
    .select('station_id, name, kind, status, battery_voltage, last_transmission_at, rssi, lon, lat')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: meta } = await supabase
    .from('station')
    .select('id, valley, district:district_id(name_en, name_ur)')

  const metaById = new Map(
    (meta ?? []).map((s) => {
      const district = s.district as { name_en: string; name_ur: string | null } | null
      const name_en = district?.name_en ?? null
      const name_ur = enrichDistrictNameUr(name_en, district?.name_ur)
      return [
        s.id,
        {
          valley: s.valley as string | null,
          district_name: name_en,
          district_name_ur: name_ur,
        },
      ]
    })
  )

  const features = (data ?? [])
    .filter((s) => s.lon != null && s.lat != null)
    .map((s) => {
      const m = metaById.get(s.station_id)
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
        properties: {
          station_id: s.station_id,
          name: s.name,
          kind: s.kind,
          valley: m?.valley ?? null,
          district_name: m?.district_name ?? null,
          district_name_ur: m?.district_name_ur ?? null,
          status: s.status,
          battery_voltage: s.battery_voltage,
          last_transmission_at: s.last_transmission_at,
          rssi: s.rssi,
        },
      }
    })

  return NextResponse.json({ type: 'FeatureCollection', features })
}

