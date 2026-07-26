'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DeckGL from '@deck.gl/react'
import { GeoJsonLayer } from '@deck.gl/layers'
import { Map } from 'react-map-gl/maplibre'
import type { StyleSpecification } from 'maplibre-gl'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useReplay } from '@/lib/replay/ReplayContext'
import { getMapCenter, getReplayMarkerGeoJson } from '@/lib/replay/adapters'
import ReplayOverlay from '@/lib/replay/ReplayOverlay'
import { stationMarkerDataUrl, stationLegendSvg } from '@/lib/station-marker'
import { useDashboardBoot } from '@/components/DashboardBootGate'
import {
  getBootDistrictGeo,
  startDashboardBootstrap,
  subscribeDashboardBoot,
} from '@/lib/dashboard-bootstrap'
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
  // Off by default — Copernicus GloFAS OWS is often flaky (502s) and floods
  // the console with MapLibre AJAXError when left on. Users can still enable it.
  { id: 'glofas',       labelKey: 'layerGlofas',       defaultVisible: false },
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

/** RTL-safe switch — uses logical start/end so the knob mirrors correctly in Urdu. */
function LayerSwitch({ on, tone = 'emerald' }: { on: boolean; tone?: 'emerald' | 'red' }) {
  const onColor = tone === 'red' ? 'bg-red-500' : 'bg-emerald-500'
  return (
    <span
      role="switch"
      aria-checked={on}
      className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent px-0.5 transition-colors duration-200 ${
        on ? onColor : 'bg-white/20'
      } ${on ? 'justify-end' : 'justify-start'}`}
    >
      <span className="pointer-events-none block h-4 w-4 rounded-full bg-white shadow" />
    </span>
  )
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
  const isRTL = locale === 'ur'
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

  // --- UI-only additions (Tasks 1 & 2): floating Map Layers + Legend panels ---
  // These only control panel *visibility*. No layer/legend data or logic changes.
  const [layersOpen, setLayersOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
  const [layerNotice, setLayerNotice] = useState<string | null>(null)
  const glofasFailHandled = useRef(false)
  const layersControlRef = useRef<HTMLDivElement>(null)
  const legendControlRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (layersControlRef.current && !layersControlRef.current.contains(e.target as Node)) {
        setLayersOpen(false)
      }
      if (legendControlRef.current && !legendControlRef.current.contains(e.target as Node)) {
        setLegendOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setLayersOpen(false)
        setLegendOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const openDistrict = useCallback(
    (districtId: string) => {
      router.push(`/${locale}/dashboard/district/${districtId}`)
    },
    [locale, router]
  )

  const handleToggle = useCallback((toggleId: string) => {
    setVisibility((prev) => {
      const nextOn = !prev[toggleId]
      // Reset fail latch when the user explicitly re-enables GloFAS
      if (toggleId === 'glofas' && nextOn) {
        glofasFailHandled.current = false
        setLayerNotice(null)
      }
      return { ...prev, [toggleId]: nextOn }
    })
  }, [])

  const disableGlofasAfterFailure = useCallback(() => {
    if (glofasFailHandled.current) return
    glofasFailHandled.current = true
    setVisibility((prev) => (prev.glofas ? { ...prev, glofas: false } : prev))
    setLayerNotice(t('glofasUnavailable'))
  }, [t])

  // District GeoJSON comes from the one-shot bootstrap singleton (shared with the
  // Pakistan map boot gate) so fetches are not restarted on remounts.
  const [districtGeo, setDistrictGeo] = useState<Record<string, unknown> | null>(
    () => getBootDistrictGeo()
  )
  const { markMapReady } = useDashboardBoot()

  useEffect(() => {
    startDashboardBootstrap()
    return subscribeDashboardBoot(() => {
      const geo = getBootDistrictGeo()
      if (geo) setDistrictGeo(geo)
    })
  }, [])

  const onMapLoad = useCallback(
    (e: { target: { on: (type: string, listener: (ev: unknown) => void) => void } }) => {
      const map = e.target
      map.on('error', (ev: unknown) => {
        const event = ev as {
          error?: { status?: number; message?: string; url?: string }
          sourceId?: string
        }
        const err = event.error
        const haystack = `${err?.message ?? ''} ${err?.url ?? ''} ${event.sourceId ?? ''}`
        const isGlofas =
          haystack.includes('glofas') ||
          haystack.includes('globalfloods') ||
          event.sourceId === 'glofas-wms'
        if (isGlofas) {
          disableGlofasAfterFailure()
        }
      })

      markMapReady()
    },
    [disableGlofasAfterFailure, markMapReady]
  )

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
            if (spi === undefined) return [0, 0, 0, 0]
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
            const name = properties.name || td('map.glacialLake')
            const classLine = `${td('map.class')}: ${properties.hazard_class}`
            const pop =
              properties.downstream_population != null
                ? `\n${td('map.downstreamPopulation')}: ${Number(properties.downstream_population).toLocaleString(
                    locale === 'ur' ? 'ur-PK' : 'en-GB'
                  )}`
                : ''
            return `${name}\n${classLine}${pop}`
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
        <Map
          mapStyle={mapStyle as unknown as StyleSpecification}
          reuseMaps
          onLoad={onMapLoad}
        />
      </DeckGL>

      {layerNotice && (
        <div className="absolute inset-x-3 top-14 z-30 mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50/95 px-3 py-2 text-xs text-amber-950 shadow-lg backdrop-blur-sm md:inset-x-auto md:start-6 md:top-6">
          <div className="flex items-start gap-2">
            <p className="flex-1 leading-relaxed">{layerNotice}</p>
            <button
              type="button"
              onClick={() => setLayerNotice(null)}
              className="shrink-0 rounded-md px-1.5 py-0.5 font-semibold text-amber-800/70 hover:bg-amber-100"
              aria-label={t('dismissNotice')}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Map Layers control — floating icon button + slide/scale-in panel (Task 1) */}
      <div ref={layersControlRef} className="absolute top-3 end-3 z-20 sm:top-6 sm:end-6">
        <button
          type="button"
          onClick={() => setLayersOpen((prev) => !prev)}
          aria-expanded={layersOpen}
          aria-controls="map-layers-panel"
          aria-label={layersOpen ? t('closeMapLayers') : t('openMapLayers')}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-gray-900/85 text-white/90 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] backdrop-blur-xl transition-colors hover:bg-gray-900/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:h-11 sm:w-11"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
        </button>

        <div
          id="map-layers-panel"
          role="region"
          aria-label={t('mapLayers')}
          dir={isRTL ? 'rtl' : 'ltr'}
          inert={!layersOpen}
          className={`absolute top-12 end-0 max-h-[min(70vh,28rem)] w-[min(20rem,calc(100vw-1.5rem))] origin-top-end overflow-y-auto rounded-2xl border border-white/20 bg-gray-900/90 p-4 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] backdrop-blur-xl transition-all duration-200 ease-out sm:top-14 sm:p-5 ${
            layersOpen ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none -translate-y-2 scale-95 opacity-0'
          }`}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3
              className={`font-bold text-white/90 ${
                isRTL
                  ? 'font-[family-name:var(--font-urdu)] text-sm tracking-normal'
                  : 'font-sans text-sm uppercase tracking-widest'
              }`}
            >
              {t('mapLayers')}
            </h3>
            <div className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.6)]" />
          </div>

          {/* High Severity Only toggle */}
          <button
            type="button"
            className="mb-3 flex w-full items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-2.5 text-start transition-colors hover:bg-red-500/20"
            onClick={() => setHighSeverityOnly((prev) => !prev)}
          >
            <span
              className={`min-w-0 flex-1 font-semibold transition-colors ${
                isRTL
                  ? 'font-[family-name:var(--font-urdu)] text-[13px] leading-7'
                  : 'text-xs leading-4'
              } ${highSeverityOnly ? 'text-red-300' : 'text-white/70'}`}
            >
              {t('highestAlertsOnly')}
            </span>
            <LayerSwitch on={highSeverityOnly} tone="red" />
          </button>

          <ul className="space-y-1">
            {LAYER_TOGGLES.map((toggle) => {
              const isActive = visibility[toggle.id]
              return (
                <li key={toggle.id}>
                  <button
                    type="button"
                    className="group flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl p-2.5 text-start transition-colors duration-200 hover:bg-white/5"
                    onClick={() => handleToggle(toggle.id)}
                  >
                    <span
                      className={`min-w-0 flex-1 font-medium transition-colors duration-200 ${
                        isRTL
                          ? 'font-[family-name:var(--font-urdu)] text-[13px] leading-7'
                          : 'text-xs leading-4'
                      } ${isActive ? 'text-white' : 'text-white/60 group-hover:text-white/80'}`}
                    >
                      {t(toggle.labelKey as 'layerFlood')}
                    </span>
                    <LayerSwitch on={isActive} />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {/* Map Legend control — compact floating button that expands upward (Task 2) */}
      {/* Cleared above the mobile hazard peek (h-12) + bottom nav; desktop keeps original offset */}
      <div ref={legendControlRef} className="absolute bottom-16 start-3 z-20 sm:bottom-6 sm:start-6">
        <div
          id="map-legend-panel"
          role="region"
          aria-label={t('legend')}
          dir={isRTL ? 'rtl' : 'ltr'}
          inert={!legendOpen}
          className={`absolute bottom-12 start-0 w-52 origin-bottom-start rounded-xl border border-white/20 bg-gray-900/90 px-3.5 py-3 leading-tight shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] backdrop-blur-xl transition-all duration-200 ease-out sm:bottom-14 sm:w-56 sm:px-4 ${
            legendOpen ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-2 scale-95 opacity-0'
          }`}
        >
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <svg width="12" height="12" className="shrink-0"><circle cx="6" cy="6" r="5" fill="#D97757" stroke="white" strokeWidth="1"/></svg>
              <span className={`text-[11px] leading-tight text-white/80 ${isRTL ? 'font-[family-name:var(--font-urdu)] leading-6' : ''}`}>{t('hazardEvent')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="inline-flex shrink-0"
                dangerouslySetInnerHTML={{ __html: stationLegendSvg('online') }}
              />
              <span className={`text-[11px] leading-tight text-white/80 ${isRTL ? 'font-[family-name:var(--font-urdu)] leading-6' : ''}`}>{t('fieldStation')}</span>
            </div>
            {visibility.stations && (
              <div className="ms-4 space-y-1 border-s border-white/10 ps-2">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#0F6B3D]" />
                  <span className="text-[10px] leading-tight text-white/70">Online</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#E0A030]" />
                  <span className="text-[10px] leading-tight text-white/70">Degraded</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#B3261E]" />
                  <span className="text-[10px] leading-tight text-white/70">Offline</span>
                </div>
              </div>
            )}
            {visibility.glofas && (
              <>
                <div className="my-1 border-t border-white/10" />
                <p className="text-[9px] font-semibold uppercase leading-tight tracking-wide text-white/50">{t('glofasHeading')} (1–30d)</p>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm bg-yellow-400" />
                  <span className="text-[11px] leading-tight text-white/80">{t('glofas2yr')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm bg-red-500" />
                  <span className="text-[11px] leading-tight text-white/80">{t('glofas5yr')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm bg-purple-600" />
                  <span className="text-[11px] leading-tight text-white/80">{t('glofas20yr')}</span>
                </div>
              </>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setLegendOpen((prev) => !prev)}
          aria-expanded={legendOpen}
          aria-controls="map-legend-panel"
          aria-label={legendOpen ? t('closeLegend') : t('openLegend')}
          className="flex items-center gap-2 rounded-full border border-white/20 bg-gray-900/85 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white/90 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] backdrop-blur-xl transition-colors hover:bg-gray-900/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:px-4 sm:text-[11px]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 4h16v4H4z" />
            <path d="M4 12h10M4 18h7" />
          </svg>
          {t('legend')}
        </button>
      </div>

      {isReplaying && <ReplayOverlay />}
    </div>
  )
}
