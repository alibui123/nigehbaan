'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DeckGL from '@deck.gl/react'
import { GeoJsonLayer } from '@deck.gl/layers'
import { Map } from 'react-map-gl/maplibre'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useReplay } from '@/lib/replay/ReplayContext'
import { getMapCenter, getReplayMarkerGeoJson } from '@/lib/replay/adapters'
import ReplayOverlay from '@/lib/replay/ReplayOverlay'
import { stationMarkerDataUrl, stationLegendSvg } from '@/lib/station-marker'
import 'maplibre-gl/dist/maplibre-gl.css'

interface LayerToggle {
  id: string
  labelKey: string
  defaultVisible: boolean
}
/** GloFAS WMS-T (S2) — flood summary days 1–30 (2/5/20-yr exceedance). */
const GLOFAS_WMS_BASE = 'https://ows.globalfloods.eu/glofas-ows/ows.py'
const GLOFAS_WMS_LAYER = 'sumAL43EGE'

const LAYER_TOGGLES: LayerToggle[] = [
  { id: 'flood',        labelKey: 'layerFlood',        defaultVisible: true  },
  { id: 'glofas',       labelKey: 'layerGlofas',       defaultVisible: true  },
  { id: 'ffd',          labelKey: 'layerFfd',          defaultVisible: true  },
  { id: 'fires',        labelKey: 'layerFires',        defaultVisible: true  },
  { id: 'earthquakes',  labelKey: 'layerEarthquakes',  defaultVisible: true  },
  { id: 'drought',      labelKey: 'layerDrought',      defaultVisible: false },
  { id: 'glacial',      labelKey: 'layerGlacial',      defaultVisible: true  },
  { id: 'stations',     labelKey: 'layerStations',     defaultVisible: false },
  { id: 'snow',         labelKey: 'layerSnow',         defaultVisible: false },
]

const STATION_ICON_ONLINE = stationMarkerDataUrl('online')
const STATION_ICON_DEGRADED = stationMarkerDataUrl('degraded')
const STATION_ICON_OFFLINE = stationMarkerDataUrl('offline')

function stationIconUrl(status: string | null | undefined): string {
  if (status === 'online') return STATION_ICON_ONLINE
  if (status === 'degraded') return STATION_ICON_DEGRADED
  return STATION_ICON_OFFLINE
}

function hazardPointLayer(
  id: string,
  data: string,
  color: [number, number, number, number]
) {
  return new GeoJsonLayer({
    id,
    data,
    pickable: true,
    stroked: true,
    filled: true,
    pointType: 'circle',
    getPointRadius: 8000,
    getFillColor: color,
    getLineColor: [255, 255, 255, 255],
    getLineWidth: 200,
  })
}

export default function DashboardMap() {
  const locale = useLocale()
  const t = useTranslations('Dashboard')
  const td = useTranslations('Data')
  const router = useRouter()
  const { isReplaying, scenario, currentFrame } = useReplay()

  const [visibility, setVisibility] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    LAYER_TOGGLES.forEach((t) => { init[t.id] = t.defaultVisible })
    return init
  })

  const [highSeverityOnly, setHighSeverityOnly] = useState(false)

  const openDistrict = useCallback(
    (districtId: string) => {
      router.push(`/${locale}/dashboard/district/${districtId}`)
    },
    [locale, router]
  )

  const handleToggle = useCallback((toggleId: string) => {
    setVisibility((prev) => ({ ...prev, [toggleId]: !prev[toggleId] }))
  }, [])

  // Deduplicate district GeoJSON fetch — one fetch, shared by visual + pick layers
  const [districtGeo, setDistrictGeo] = useState<Record<string, unknown> | null>(null)
  useEffect(() => {
    fetch('/api/districts').then((r) => r.json()).then(setDistrictGeo).catch(() => {})
  }, [])

  // Track which layers have been activated at least once to defer initial fetch
  const [activated, setActivated] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    LAYER_TOGGLES.forEach((t) => { init[t.id] = t.defaultVisible })
    return init
  })
  useEffect(() => {
    setActivated((prev) => {
      const next = { ...prev }
      let changed = false
      for (const key of Object.keys(visibility)) {
        if (visibility[key] && !prev[key]) { next[key] = true; changed = true }
      }
      return changed ? next : prev
    })
  }, [visibility])

  const layers = useMemo(() => {
    const arr: GeoJsonLayer[] = []

    // Visual district boundaries (not pickable — overlay layers sit above this)
    if (districtGeo) {
      arr.push(
        new GeoJsonLayer({
          id: 'district-layer',
          data: districtGeo as any,
          pickable: false,
          stroked: true,
          filled: true,
          lineWidthMinPixels: 1,
          getFillColor: (d: { properties: { province?: string } }) => {
            const p = d.properties.province
            if (p === 'KP') return [15, 107, 61, 30]
            if (p === 'GB') return [1, 65, 28, 30]
            return [136, 136, 136, 30]
          },
          getLineColor: [1, 65, 28, 255],
        })
      )

      // Transparent pick layer for district clicks (must be BEFORE point layers so it doesn't block their tooltips)
      arr.push(
        new GeoJsonLayer({
          id: 'district-pick-layer',
          data: districtGeo as any,
          pickable: true,
          stroked: false,
          filled: true,
          getFillColor: [0, 0, 0, 0],
          onClick: ({ object }: { object?: { properties?: { id?: string } } }) => {
            const districtId = object?.properties?.id
            if (districtId) openDistrict(districtId)
          },
        })
      )
    }

    if (visibility.flood && activated.flood) {
      arr.push(
        new GeoJsonLayer({
          id: 'flood-layer',
          data: '/api/flood-forecast',
          pickable: false,
          stroked: false,
          filled: true,
          getFillColor: (d: { properties: { risk_level?: string } }) => {
            const r = d.properties.risk_level
            if (highSeverityOnly && r !== 'high') return [0, 0, 0, 0]
            if (r === 'high') return [179, 38, 30, 90]
            if (r === 'medium') return [224, 160, 48, 90]
            if (r === 'low') return [15, 107, 61, 90]
            return [204, 204, 204, 90]
          },
          updateTriggers: {
            getFillColor: [highSeverityOnly],
          },
        })
      )
    }

    if (visibility.ffd && activated.ffd) {
      arr.push(
        new GeoJsonLayer({
          id: 'ffd-river-layer',
          data: '/api/pmd/river-flows',
          pickable: true,
          pointType: 'circle',
          getPointRadius: 9000,
          getFillColor: (d: { properties: { flood_level?: string } }) => {
            const level = (d.properties.flood_level ?? 'unknown') as
              | 'low'
              | 'medium'
              | 'high'
              | 'very high'
              | 'exceptionally high'
              | 'unknown'
            if (highSeverityOnly && level !== 'exceptionally high') return [0, 0, 0, 0]
            if (level === 'exceptionally high' || level === 'very high') return [179, 38, 30, 220]
            if (level === 'high') return [224, 160, 48, 210]
            if (level === 'medium') return [242, 201, 76, 200]
            if (level === 'low') return [15, 107, 61, 190]
            return [30, 64, 120, 200]
          },
          getLineColor: [255, 255, 255, 255],
          getLineWidth: 200,
          updateTriggers: {
            getFillColor: [highSeverityOnly],
          },
        })
      )
    }

    if (visibility.fires && activated.fires) {
      arr.push(
        new GeoJsonLayer({
          id: 'fire-layer',
          data: '/api/hazards?hazard=fire',
          pickable: true,
          stroked: true,
          filled: true,
          pointType: 'circle',
          getPointRadius: 8000,
          getFillColor: (d: { properties: { severity?: string } }) => {
            if (highSeverityOnly && d.properties.severity !== 'emergency') return [0, 0, 0, 0]
            return [217, 119, 87, 200]
          },
          getLineColor: [255, 255, 255, 255],
          getLineWidth: 200,
          updateTriggers: {
            getFillColor: [highSeverityOnly],
          },
        })
      )
    }

    if (visibility.earthquakes && activated.earthquakes) {
      arr.push(
        new GeoJsonLayer({
          id: 'earthquake-layer',
          data: '/api/hazards?hazard=earthquake',
          pickable: true,
          stroked: true,
          filled: true,
          pointType: 'circle',
          getPointRadius: (d: { properties: { severity?: string } }) =>
            d.properties.severity === 'emergency' ? 12000 : 8000,
          getFillColor: (d: { properties: { severity?: string } }) => {
            const s = d.properties.severity
            if (highSeverityOnly && s !== 'emergency') return [0, 0, 0, 0]
            if (s === 'emergency') return [179, 38, 30, 200]
            if (s === 'warning') return [217, 119, 87, 200]
            if (s === 'watch') return [224, 160, 48, 200]
            return [136, 136, 136, 180]
          },
          getLineColor: [255, 255, 255, 255],
          getLineWidth: 200,
          updateTriggers: {
            getFillColor: [highSeverityOnly],
          },
        })
      )
    }

    if (visibility.drought && activated.drought) {
      arr.push(
        new GeoJsonLayer({
          id: 'drought-layer',
          data: '/api/drought',
          pickable: false,
          stroked: false,
          filled: true,
          getFillColor: (d: { properties: { spi_3?: number } }) => {
            const spi = d.properties.spi_3
            if (spi <= -2.0) return [139, 0, 0, 100]
            if (spi <= -1.5) return [204, 51, 0, 100]
            if (spi <= -1.0) return [255, 102, 0, 100]
            if (spi <= 0) return [255, 215, 0, 100]
            return [0, 0, 0, 0]
          },
        })
      )
    }

    if ((visibility.glacial && activated.glacial)) {
      arr.push(
        new GeoJsonLayer({
          id: 'glacial-lake-layer',
          data: '/api/glacial-lakes',
          pickable: true,
          stroked: true,
          filled: true,
          pointType: 'circle',
          getPointRadius: 6000,
          getFillColor: (d: { properties: { hazard_class?: string } }) => {
            const h = d.properties.hazard_class
            if (highSeverityOnly && h !== 'High') return [0, 0, 0, 0]
            if (h === 'High') return [179, 38, 30, 255]
            if (h === 'Medium') return [224, 160, 48, 255]
            if (h === 'Low') return [242, 201, 76, 255]
            return [136, 136, 136, 255]
          },
          getLineColor: [255, 255, 255, 255],
          getLineWidth: 200,
          updateTriggers: {
            getFillColor: [highSeverityOnly],
          },
        })
      )
    }

    if (visibility.stations || isReplaying) {
      arr.push(
        new GeoJsonLayer({
          id: 'stations-layer',
          data: '/api/stations',
          pickable: true,
          pointType: 'icon',
          getIcon: (d: { properties: { status?: string } }) => ({
            url: stationIconUrl(d.properties.status),
            width: 64,
            height: 64,
            anchorY: 58,
            mask: false,
          }),
          getIconSize: 28,
          iconSizeUnits: 'pixels',
          iconSizeMinPixels: 18,
          iconSizeMaxPixels: 40,
          updateTriggers: {
            getIcon: [],
          },
        })
      )
    }

    const replayGeo = getReplayMarkerGeoJson(currentFrame, scenario)
    if (isReplaying && replayGeo) {
      arr.push(
        new GeoJsonLayer({
          id: 'replay-marker-layer',
          data: replayGeo,
          pickable: true,
          pointType: 'circle',
          getPointRadius: 12000,
          getFillColor: [179, 38, 30, 230],
          getLineColor: [255, 255, 255, 255],
          getLineWidth: 300,
        })
      )
    }

    return arr
  }, [visibility, activated, districtGeo, openDistrict, isReplaying, currentFrame, scenario, highSeverityOnly])

  const initialViewState = getMapCenter(isReplaying ? scenario : null)

  const mapStyle = useMemo(() => {
    const style: {
      version: 8
      sources: Record<string, unknown>
      layers: Record<string, unknown>[]
    } = {
      version: 8,
      sources: {
        'carto-light': {
          type: 'raster',
          tiles: [
            'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
            'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
          ],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors © CARTO',
        },
      },
      layers: [{ id: 'carto-light-layer', type: 'raster', source: 'carto-light' }],
    }

    // S2 — GloFAS WMS-T exceedance overlay (Copernicus EMS). MapLibre expands
    // {bbox-epsg-3857} per tile so no proxy/ingest job is required.
    // Keep braces literal — URLSearchParams would encode them and break substitution.
    if (visibility.glofas) {
      const tileUrl =
        `${GLOFAS_WMS_BASE}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap` +
        `&FORMAT=image/png&TRANSPARENT=TRUE&LAYERS=${GLOFAS_WMS_LAYER}` +
        `&CRS=EPSG:3857&STYLES=&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`
      style.sources['glofas-wms'] = {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        attribution: 'GloFAS © Copernicus EMS / ECMWF',
      }
      style.layers.push({
        id: 'glofas-wms-layer',
        type: 'raster',
        source: 'glofas-wms',
        paint: { 'raster-opacity': 0.72 },
      })
    }

    if (visibility.snow) {
      const d = new Date()
      d.setDate(d.getDate() - 2)
      const dateStr = d.toISOString().split('T')[0]
      style.sources['snow-cover'] = {
        type: 'raster',
        tiles: [
          `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_NDSI_Snow_Cover/default/${dateStr}/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png`,
        ],
        tileSize: 256,
      }
      style.layers.push({
        id: 'snow-cover-layer',
        type: 'raster',
        source: 'snow-cover',
        paint: { 'raster-opacity': 0.7 },
      })
    }

    return style
  }, [visibility.glofas, visibility.snow])

  const deckRef = useRef<any>(null)

  return (
    <div className="relative h-full w-full">
      <DeckGL
        ref={deckRef}
        initialViewState={{ ...initialViewState, pitch: 45, bearing: 0 }}
        controller={true}
        layers={layers}
        onClick={(info) => {
          // If we clicked directly on the district layer
          if (info.layer?.id === 'district-pick-layer' && info.object?.properties?.id) {
            openDistrict(info.object.properties.id)
            return
          }
          // If we clicked a dot on top, drill down to find the district underneath
          if (deckRef.current && deckRef.current.deck) {
            const picked = deckRef.current.deck.pickMultipleObjects({ x: info.x, y: info.y })
            const districtHit = picked.find((p: any) => p.layer.id === 'district-pick-layer')
            if (districtHit?.object?.properties?.id) {
              openDistrict(districtHit.object.properties.id)
            }
          }
        }}
        getTooltip={({ object }) => {
          if (!object) return null
          const { properties } = object as { properties: Record<string, string | number | null> }
          const districtName =
            locale === 'ur'
              ? String(properties.name_ur || properties.display_name_ur || properties.name_en || '')
              : String(properties.name_en || properties.display_name_en || '')
          const stationDistrict =
            locale === 'ur'
              ? String(properties.district_name_ur || properties.district_name || '')
              : String(properties.district_name || '')

          if (properties.water_level_m != null) {
            return `${properties.name}\n${td('map.level')}: ${properties.water_level_m} m\n${td('map.rate')}: ${properties.rate} m/hr`
          }
          if (properties.discharge_cusecs != null) {
            return `${properties.name}\n${Number(properties.discharge_cusecs).toLocaleString(locale === 'ur' ? 'ur-PK' : 'en-GB')} ${td('map.cusecs')}\nFFD: ${properties.ffd_risk ?? properties.flood_level}`
          }
          if (properties.title) {
            const sev = properties.severity
              ? td.has(`severity.${properties.severity}`)
                ? td(`severity.${String(properties.severity)}` as 'severity.emergency')
                : String(properties.severity)
              : ''
            return `${properties.title}\n${td('map.severity')}: ${sev}`
          }
          if (properties.hazard_class) {
            return `${properties.name || td('map.glacialLake')}\n${td('map.class')}: ${properties.hazard_class}`
          }
          if (properties.status && (properties.station_id || properties.name)) {
            const st = td.has(`status.${properties.status}`)
              ? td(`status.${String(properties.status)}` as 'status.online')
              : String(properties.status)
            const districtLine = stationDistrict ? `\n${stationDistrict}` : ''
            return `${properties.name || td('map.station')}${districtLine}\n${td('map.status')}: ${st}`
          }
          if (properties.risk_level) {
            const risk = td.has(`risk.${properties.risk_level}`)
              ? td(`risk.${String(properties.risk_level)}` as 'risk.high')
              : String(properties.risk_level)
            return `${districtName || properties.name_en}\n${td('map.flood')}: ${risk}`
          }

          if (properties.name_en || properties.name_ur) {
            const prov = properties.province
              ? td.has(`province.${properties.province}`)
                ? td(`province.${String(properties.province)}` as 'province.KP')
                : String(properties.province)
              : ''
            return `${districtName}\n${prov}\n${td('map.openDistrict')}`
          }

          return null
        }}
      >
        <Map mapStyle={mapStyle} reuseMaps />
      </DeckGL>

      <div className="absolute top-6 right-6 z-10 max-h-[calc(100%-3rem)] w-72 overflow-y-auto rounded-2xl border border-white/20 bg-gray-900/80 p-5 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-sans text-sm font-bold uppercase tracking-widest text-white/90">
           {t('mapLayers')}
          </h3>
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.6)]" />
        </div>

        {/* High Severity Only toggle */}
        <div
          className="mb-3 flex cursor-pointer items-center justify-between rounded-xl border border-red-500/20 bg-red-500/10 p-2.5 transition-colors hover:bg-red-500/20"
          onClick={() => setHighSeverityOnly((prev) => !prev)}
        >
          <span className={`text-xs font-semibold whitespace-nowrap transition-colors ${highSeverityOnly ? 'text-red-300' : 'text-white/70'}`}>
            🚨{t('highestAlertsOnly')}
          </span>
          <div
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-300 ${highSeverityOnly ? 'bg-red-500' : 'bg-white/20'}`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-300 ease-in-out ${highSeverityOnly ? 'translate-x-4' : 'translate-x-0'}`}
            />
          </div>
        </div>

        <ul className="space-y-2">
          {LAYER_TOGGLES.map((toggle) => {
            const isActive = visibility[toggle.id]
            return (
              <li
                key={toggle.id}
                className="group flex cursor-pointer items-center justify-between rounded-xl p-2 transition-colors duration-200 hover:bg-white/5"
                onClick={() => handleToggle(toggle.id)}
              >
                 <span
                  className={`text-xs font-medium transition-colors duration-200 ${isActive ? 'text-white' : 'text-white/60 group-hover:text-white/80'}`}
                >
                  {t(toggle.labelKey)}
                </span>
                <div
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-300 ${isActive ? 'bg-emerald-500' : 'bg-white/20'}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-300 ease-in-out ${isActive ? 'translate-x-4' : 'translate-x-0'}`}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Map Legend */}
      <div className="absolute bottom-6 left-6 z-10 rounded-xl border border-white/20 bg-gray-900/80 px-4 py-3 backdrop-blur-xl">
        <h4 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/70">{t('legend')}</h4>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="#D97757" stroke="white" strokeWidth="1"/></svg>
            <span className="text-[11px] text-white/80">{t('hazardEvent')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex"
              dangerouslySetInnerHTML={{ __html: stationLegendSvg('online') }}
            />
            <span className="text-[11px] text-white/80">{t('fieldStation')}</span>
          </div>
          {visibility.stations && (
            <div className="ms-4 space-y-1 border-s border-white/10 ps-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#0F6B3D]" />
                <span className="text-[10px] text-white/70">Online</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#E0A030]" />
                <span className="text-[10px] text-white/70">Degraded</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#B3261E]" />
                <span className="text-[10px] text-white/70">Offline</span>
              </div>
            </div>
          )}
          {visibility.glofas && (
            <>
              <div className="my-1 border-t border-white/10" />
              <p className="text-[9px] font-semibold uppercase tracking-wide text-white/50">{t('glofasHeading')} (1–30d)</p>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-yellow-400" />
                <span className="text-[11px] text-white/80">{t('glofas2yr')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-red-500" />
                <span className="text-[11px] text-white/80">{t('glofas5yr')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-purple-600" />
                <span className="text-[11px] text-white/80">{t('glofas20yr')}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {isReplaying && <ReplayOverlay />}
    </div>
  )
}
