'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logAudit } from '@/lib/audit'
import { canEditCap, type AppRole } from '@/lib/alert-workflow'
import { z } from 'zod'

const CAPSchema = z.object({
  event_en: z.string().min(1, 'English event name is required'),
  event_ur: z.string().optional().nullable(),
  urgency: z.enum(['immediate', 'expected', 'future', 'past']).nullable(),
  certainty: z.enum(['observed', 'likely', 'possible', 'unlikely']).nullable(),
  headline_en: z.string().optional().nullable(),
  headline_ur: z.string().optional().nullable(),
  instructions_en: z.string().optional().nullable(),
  instructions_ur: z.string().optional().nullable(),
  severity: z.enum(['emergency', 'warning', 'watch', 'advisory']),
})

export type CapFormState = {
  status: 'idle' | 'success' | 'error'
  message?: string
}

export async function updateCapFields(
  _prevState: CapFormState,
  formData: FormData
): Promise<CapFormState> {
  const id = formData.get('id') as string
  const locale = (formData.get('locale') as string) || 'en'

  try {
    const supabase = await createClient()

    const emptyToNull = (v: FormDataEntryValue | null) => {
      const s = v as string
      return s && s.trim() !== '' ? s : null
    }

    const rawData = {
      event_en: formData.get('event_en'),
      event_ur: formData.get('event_ur'),
      urgency: emptyToNull(formData.get('urgency')),
      certainty: emptyToNull(formData.get('certainty')),
      headline_en: formData.get('headline_en'),
      headline_ur: formData.get('headline_ur'),
      instructions_en: formData.get('instructions_en'),
      instructions_ur: formData.get('instructions_ur'),
      severity: formData.get('severity'),
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { status: 'error', message: 'Not authenticated' }

    const { data: profile } = await supabase.from('profile').select('role').eq('id', user.id).single()
    if (!canEditCap(profile?.role as AppRole)) {
      return { status: 'error', message: 'Only duty officers or DG can edit CAP fields' }
    }

    const parsedData = CAPSchema.safeParse(rawData)
    if (!parsedData.success) {
      return { status: 'error', message: `Validation failed: ${parsedData.error.message}` }
    }

    const { error } = await supabase.from('alert_candidate').update(parsedData.data).eq('id', id)
    if (error) return { status: 'error', message: error.message }

    await logAudit(supabase, {
      action: 'edit_cap_fields',
      entity: 'alert_candidate',
      entity_id: id,
      actor: user.id,
      actor_role: profile?.role || 'viewer',
    })

    revalidatePath(`/${locale}/dashboard/alerts/${id}`)

    return { status: 'success', message: 'CAP fields saved successfully.' }
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Failed to save CAP fields.',
    }
  }
}