'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useReplay } from '@/lib/replay/ReplayContext'
import { formatReplayDuration } from '@/lib/replay/adapters'
import { phaseLabel, phaseColor } from '@/lib/replay/labels'
import { isFloodFrame, isGlofFrame } from '@/lib/replay/types'
import PageHeader from '../PageHeader'

export default function ReplayPage() {
  const locale = useLocale()
  const t = useTranslations('Replay')
  const tc = useTranslations('Common')
  const router = useRouter()
  const {
    isReplaying,
    scenario,
    scenarios,
    currentFrame,
    playbackSeconds,
    isPlaying,
    speedMultiplier,
    scenariosLoadError,
    loadScenario,
    play,
    pause,
    seekToScenarioSeconds,
    setSpeedMultiplier,
    exitReplay,
  } = useReplay()

  const launchOnOverview = async (slug: string) => {
    await loadScenario(slug)
    router.push(`/${locale}/dashboard`)
    setTimeout(() => play(), 300)
  }

  if (!isReplaying || !scenario) {
    return (
      <div className="min-h-dvh bg-[var(--color-base)]">
        <PageHeader
          locale={locale}
          title={t('title')}
          subtitle={t('subtitle')}
          backLabel={tc('backToOverview')}
        />

        <div className="dashboard-page-body mx-auto max-w-2xl space-y-3 px-3 pt-4 sm:space-y-4 sm:px-6 sm:pt-6">
          {scenarios.length === 0 && (
            <p className="rounded-2xl border border-dashed border-[var(--color-border)] p-6 text-sm text-[var(--color-ink)]/50">
              {scenariosLoadError ? (
                <>Could not load scenarios: {scenariosLoadError}</>
              ) : (
                <>
                  No published scenarios found. Run{' '}
                  <code className="font-mono text-xs">python scripts/seed_replay_hunza_shisper.py</code> and{' '}
                  <code className="font-mono text-xs">python scripts/seed_replay_nowshera_flood.py</code>.
                </>
              )}
            </p>
          )}

          {scenarios.map((s) => (
            <div
              key={s.id}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm sm:p-5"
            >
              <h2 className="font-semibold text-[var(--color-ink)]">{s.name}</h2>
              <p className="mt-1 text-sm text-[var(--color-ink)]/70">{s.description}</p>
              <p className="mt-2 font-mono text-xs text-[var(--color-ink)]/40">
                {s.district} · {s.hazard_type} · {formatReplayDuration(s.duration_seconds)} real time ·{' '}
                {s.default_speed_multiplier}× default
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => loadScenario(s.slug)}
                  className="tap-target rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm active:bg-[var(--color-base)]"
                >
                  Open here
                </button>
                <button
                  type="button"
                  onClick={() => launchOnOverview(s.slug)}
                  className="tap-target rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white active:bg-[var(--color-primary-hover)]"
                >
                  Launch on Overview →
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const progressPct = (playbackSeconds / scenario.duration_seconds) * 100
  const phase = currentFrame?.phase ?? 'baseline'
  const data = currentFrame?.frame_data

  return (
    <div className="min-h-dvh bg-[var(--color-base)]">
      <PageHeader
        locale={locale}
        title={scenario.name}
        backLabel="← Overview"
        trailing={
          <button
            type="button"
            onClick={exitReplay}
            className="rounded-lg border border-white/30 px-3 py-1.5 text-xs text-white active:bg-white/10 sm:text-sm"
          >
            Exit Replay
          </button>
        }
      />

      <div className="dashboard-page-body mx-auto max-w-3xl space-y-4 px-3 pt-4 sm:space-y-6 sm:px-6 sm:pt-6">
        <div
          className="rounded-2xl border bg-[var(--color-surface)] p-4 sm:p-5"
          style={{ borderColor: `${phaseColor(phase)}44` }}
        >
          <span
            className="inline-block rounded-full px-3 py-0.5 text-xs font-bold uppercase text-white"
            style={{ backgroundColor: phaseColor(phase) }}
          >
            {phaseLabel(phase)}
          </span>
          <p className="mt-3 text-sm text-[var(--color-ink)]">{currentFrame?.narration}</p>
        </div>

        <div>
          <input
            type="range"
            min={0}
            max={scenario.duration_seconds}
            step={1}
            value={playbackSeconds}
            onChange={(e) => seekToScenarioSeconds(Number(e.target.value))}
            className="w-full accent-[var(--color-primary)]"
          />
          <div className="mt-1 flex justify-between text-xs text-[var(--color-ink)]/50">
            <span>{formatReplayDuration(playbackSeconds)}</span>
            <span>{formatReplayDuration(scenario.duration_seconds)} total</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={isPlaying ? pause : play}
            className="tap-target rounded-xl bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white"
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <select
            value={speedMultiplier}
            onChange={(e) => setSpeedMultiplier(Number(e.target.value))}
            className="rounded-xl border border-[var(--color-border)] px-3 py-2.5 text-sm"
          >
            <option value={60}>60×</option>
            <option value={120}>120×</option>
            <option value={200}>200×</option>
            <option value={300}>300×</option>
          </select>
          <span className="text-sm text-[var(--color-ink)]/50">{Math.round(progressPct)}% complete</span>
          <button
            type="button"
            onClick={() => router.push(`/${locale}/dashboard`)}
            className="w-full text-sm text-[var(--color-primary)] underline sm:ml-auto sm:w-auto"
          >
            View on map →
          </button>
        </div>

        {data && (
          <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
            {isGlofFrame(data) && (
              <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
                <h2 className="mb-2 text-xs font-bold uppercase text-[var(--color-ink)]/50">GLOF Station</h2>
                <dl className="space-y-1 text-sm">
                  <div>Water level: <strong>{data.station.water_level_m} m</strong></div>
                  <div>Rate of rise: <strong>{data.station.rate_of_rise_m_per_hr} m/hr</strong></div>
                  <div>Battery: {data.station.battery_voltage} V · RSSI {data.station.rssi_dbm} dBm</div>
                </dl>
              </div>
            )}
            {isFloodFrame(data) && (
              <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
                <h2 className="mb-2 text-xs font-bold uppercase text-[var(--color-ink)]/50">River Gauge</h2>
                <dl className="space-y-1 text-sm">
                  <div>{data.gauge.name}</div>
                  <div>Discharge: <strong>{data.gauge.discharge_cusecs.toLocaleString()} cusecs</strong></div>
                  <div>Level: <strong>{data.gauge.level_m} m</strong></div>
                  <div>FFD risk: {data.gauge.ffd_risk_level}</div>
                </dl>
              </div>
            )}
            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
              <h2 className="mb-2 text-xs font-bold uppercase text-[var(--color-ink)]/50">Alert</h2>
              {data.alert ? (
                <dl className="space-y-1 text-sm">
                  <div>{data.alert.event}</div>
                  <div>Severity: <strong>{data.alert.severity}</strong></div>
                  <div>Status: {data.alert.status}</div>
                </dl>
              ) : (
                <p className="text-sm text-[var(--color-ink)]/40">No alert yet.</p>
              )}
            </div>
            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 md:col-span-2">
              <h2 className="mb-2 text-xs font-bold uppercase text-[var(--color-ink)]/50">Dissemination</h2>
              <div className="grid grid-cols-2 gap-3 text-sm font-mono sm:flex sm:flex-wrap sm:gap-6">
                <span>Sent: {data.dissemination.sent}</span>
                <span>Delivered: {data.dissemination.delivered}</span>
                <span>Failed: {data.dissemination.failed}</span>
                <span>Ack: {data.dissemination.acknowledged}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
