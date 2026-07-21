'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { canEnterManualReading, type AppRole } from '@/lib/alert-workflow'

export async function submitManualReading(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('profile')
    .select('role, district_id')
    .eq('id', user.id)
    .single()

  const districtId = formData.get('district_id') as string
  if (
    !canEnterManualReading(
      profile?.role as AppRole,
      profile?.district_id,
      districtId
    )
  ) {
    throw new Error('Not allowed to enter readings for this district')
  }

  const stationName = formData.get('station_name') as string
  const readingType = formData.get('reading_type') as string
  const value = parseFloat(formData.get('value') as string)
  const unit = formData.get('unit') as string
  const notes = formData.get('notes') as string

  await supabase.from('manual_reading').insert({
    source: 'pmd_manual',
    station_name: stationName,
    district_id: districtId,
    reading_type: readingType,
    value,
    unit,
    entered_by: user.id,
    notes,
  })

  revalidatePath(`/dashboard/district/${districtId}`)
}