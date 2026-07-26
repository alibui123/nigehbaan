'use client'

import { useActionState, useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { updateCapFields, type CapFormState } from './cap-actions'

const inputClass = 'w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm'
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-ink)]/60'
const initialState: CapFormState = { status: 'idle' }

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm text-white hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Saving…' : 'Save CAP Fields'}
    </button>
  )
}

export default function CapEditorForm({
  alert,
  locale,
  canEdit,
  focalReadOnly,
}: {
  alert: {
    id: string
    event_en: string | null
    event_ur: string | null
    severity: string | null
    urgency: string | null
    certainty: string | null
    headline_en: string | null
    headline_ur: string | null
    title?: string | null
    instructions_en: string | null
    instructions_ur: string | null
  }
  locale: string
  canEdit: boolean
  focalReadOnly: boolean
}) {
  const [state, formAction] = useActionState(updateCapFields, initialState)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setDismissed(false)
  }, [state])

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <input type="hidden" name="id" value={alert.id} />
      <input type="hidden" name="locale" value={locale} />

      {focalReadOnly && (
        <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          Read-only CAP view. As district focal you can acknowledge deliveries on the Dissemination Board;
          composing and approving stay with duty officers / DG.
        </p>
      )}

      {state.status !== 'idle' && !dismissed && (
        <div
          role="status"
          className={`flex items-start justify-between gap-3 rounded-md px-3 py-2 text-sm ${
            state.status === 'success'
              ? 'border border-green-200 bg-green-50 text-green-800'
              : 'border border-red-200 bg-red-50 text-red-800'
          }`}
        >
          <span>{state.status === 'success' ? `✅ ${state.message}` : `❌ ${state.message}`}</span>
          <button type="button" onClick={() => setDismissed(true)} className="text-xs opacity-60 hover:opacity-100" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Event (English)</label>
          <input name="event_en" defaultValue={alert.event_en ?? ''} className={inputClass} required disabled={!canEdit} />
        </div>
        <div>
          <label className={labelClass}>Event (Urdu)</label>
          <input name="event_ur" defaultValue={alert.event_ur ?? ''} dir="rtl" className={inputClass} disabled={!canEdit} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Severity</label>
          <select name="severity" defaultValue={alert.severity ?? ''} className={inputClass} required disabled={!canEdit}>
            <option value="advisory">Advisory</option>
            <option value="watch">Watch</option>
            <option value="warning">Warning</option>
            <option value="emergency">Emergency</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Urgency</label>
          <select name="urgency" defaultValue={alert.urgency ?? ''} className={inputClass} disabled={!canEdit}>
            <option value="">—</option>
            <option value="immediate">Immediate</option>
            <option value="expected">Expected</option>
            <option value="future">Future</option>
            <option value="past">Past</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Certainty</label>
          <select name="certainty" defaultValue={alert.certainty ?? ''} className={inputClass} disabled={!canEdit}>
            <option value="">—</option>
            <option value="observed">Observed</option>
            <option value="likely">Likely</option>
            <option value="possible">Possible</option>
            <option value="unlikely">Unlikely</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Headline (English)</label>
          <input name="headline_en" defaultValue={alert.headline_en ?? alert.title ?? ''} className={inputClass} disabled={!canEdit} />
        </div>
        <div>
          <label className={labelClass}>Headline (Urdu)</label>
          <input name="headline_ur" defaultValue={alert.headline_ur ?? ''} dir="rtl" className={inputClass} disabled={!canEdit} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Instructions (English)</label>
          <textarea name="instructions_en" defaultValue={alert.instructions_en ?? ''} rows={4} className={inputClass} disabled={!canEdit} />
        </div>
        <div>
          <label className={labelClass}>Instructions (Urdu)</label>
          <textarea name="instructions_ur" defaultValue={alert.instructions_ur ?? ''} dir="rtl" rows={4} className={inputClass} disabled={!canEdit} />
        </div>
      </div>

      {canEdit && <SaveButton />}
    </form>
  )
}