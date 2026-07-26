'use client'

import { useFormStatus } from 'react-dom'

function Spinner() {
  return (
    <svg
      className="h-4 w-4 shrink-0 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  )
}

function pendingLabelFor(label: string): string {
  if (/^escalate/i.test(label)) return 'Escalating…'
  if (/issue/i.test(label)) return 'Issuing…'
  if (/submit/i.test(label)) return 'Submitting…'
  if (/return/i.test(label)) return 'Returning…'
  if (/reject|cancel/i.test(label)) return 'Cancelling…'
  if (/dismiss/i.test(label)) return 'Dismissing…'
  if (/draft/i.test(label)) return 'Updating…'
  if (/dry run|dispatch/i.test(label)) return 'Dispatching…'
  if (/live sms/i.test(label)) return 'Sending SMS…'
  if (/live whatsapp/i.test(label)) return 'Sending WhatsApp…'
  if (/acknowledge/i.test(label)) return 'Acknowledging…'
  return 'Working…'
}

export default function WorkflowSubmitButton({
  label,
  className,
  pendingLabel,
  disabled = false,
}: {
  label: string
  className: string
  pendingLabel?: string
  disabled?: boolean
}) {
  const { pending } = useFormStatus()
  const busy = pending

  return (
    <button
      type="submit"
      disabled={disabled || busy}
      aria-busy={busy}
      className={`${className} inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-70`}
    >
      {busy && <Spinner />}
      {busy ? pendingLabel ?? pendingLabelFor(label) : label}
    </button>
  )
}
