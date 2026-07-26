/**
 * Locale-aware helpers for domain data (districts, enums, CAP bilingual fields).
 * UI chrome stays in next-intl messages; this module covers fetched / enum values.
 */

export type AppLocale = 'en' | 'ur'

export function asLocale(value: string | null | undefined): AppLocale {
  return value === 'ur' ? 'ur' : 'en'
}

/** Official Urdu names for KP & GB districts (fallback when DB name_ur is null). */
export const DISTRICT_NAME_UR: Record<string, string> = {
  Astore: 'استور',
  Diamir: 'دیامر',
  Ghanche: 'گهانچے',
  Ghizer: 'غذر',
  Gilgit: 'گلگت',
  Hunza: 'ہنزہ',
  Skardu: 'سکردو',
  Nagar: 'نگر',
  Kharmang: 'کھرمنگ',
  Shigar: 'شگر',
  Darel: 'دارل',
  Tangir: 'تنگیر',
  'Gupis-Yasin': 'گوپس یاسین',
  Rondu: 'رونڈو',
  Abbottabad: 'ایبٹ آباد',
  Bajaur: 'باجوڑ',
  Bannu: 'بنوں',
  Batagram: 'بٹاگرام',
  Buner: 'بونیر',
  Charsadda: 'چارسدہ',
  'Chitral Lower': 'چترال زیریں',
  'Chitral Upper': 'چترال بالا',
  'D. I. Khan': 'ڈی آئی خان',
  Hangu: 'ہنگو',
  Haripur: 'ہری پور',
  Karak: 'کرک',
  Khyber: 'خیبر',
  Kohat: 'کوہاٹ',
  'Kohistan Lower': 'کوہستان زیریں',
  'Kohistan Upper': 'کوہستان بالا',
  'Kolai Palas Kohistan': 'کولائی پالس کوہستان',
  Kurram: 'کرم',
  'Lakki Marwat': 'لکی مروت',
  'Lower Dir': 'دیر زیریں',
  Malakand: 'مالاکنڈ',
  Mansehra: 'مانسہرہ',
  Mardan: 'مردان',
  Mohmand: 'مہمند',
  'North Waziristan': 'شمالی وزیرستان',
  Nowshera: 'نوشہرہ',
  Orakzai: 'اورکزئی',
  Peshawar: 'پشاور',
  Shangla: 'شانگلہ',
  'South Waziristan': 'جنوبی وزیرستان',
  Swabi: 'صوابی',
  Swat: 'سوات',
  Tank: 'ٹانک',
  'Tor Ghar': 'تور غر',
  'Upper Dir': 'دیر بالا',
}

export const PROVINCE_UR: Record<string, string> = {
  KP: 'خیبر پختونخوا',
  GB: 'گلگت بلتستان',
  'Khyber Pakhtunkhwa': 'خیبر پختونخوا',
  'Gilgit-Baltistan': 'گلگت بلتستان',
}

type TranslateFn = {
  (key: string, values?: Record<string, string | number>): string
  has?: (key: string) => boolean
}

/** Look up Data.* message keys with graceful fallback to the raw value. */
export function dataLabel(
  t: TranslateFn,
  group: 'severity' | 'status' | 'hazard' | 'risk' | 'province' | 'stationKind',
  value: string | null | undefined
): string {
  if (!value) return '—'
  const key = `${group}.${value}`
  if (typeof t.has === 'function' && !t.has(key)) return value
  const translated = t(key)
  if (!translated || translated === key) return value
  return translated
}

export function pickLocalized(
  locale: string | null | undefined,
  en: string | null | undefined,
  ur: string | null | undefined,
  fallback = '—'
): string {
  const loc = asLocale(locale)
  if (loc === 'ur') {
    const u = ur?.trim()
    if (u) return u
  }
  const e = en?.trim()
  if (e) return e
  const u = ur?.trim()
  if (u) return u
  return fallback
}

export function districtDisplayName(
  locale: string | null | undefined,
  nameEn: string | null | undefined,
  nameUr?: string | null
): string {
  if (!nameEn && !nameUr) return '—'
  const loc = asLocale(locale)
  if (loc === 'ur') {
    if (nameUr?.trim()) return nameUr.trim()
    if (nameEn && DISTRICT_NAME_UR[nameEn]) return DISTRICT_NAME_UR[nameEn]
  }
  return nameEn?.trim() || nameUr?.trim() || '—'
}

export function provinceDisplayName(
  locale: string | null | undefined,
  province: string | null | undefined
): string {
  if (!province) return '—'
  if (asLocale(locale) === 'ur') return PROVINCE_UR[province] ?? province
  return province
}

export function enrichDistrictNameUr(
  nameEn: string | null | undefined,
  nameUr?: string | null
): string | null {
  if (nameUr?.trim()) return nameUr.trim()
  if (nameEn && DISTRICT_NAME_UR[nameEn]) return DISTRICT_NAME_UR[nameEn]
  return null
}

/** Attach name_ur onto GeoJSON feature properties that have name_en. */
export function enrichGeoJsonNames<T extends { type?: string; features?: Array<{ properties?: Record<string, unknown> }> }>(
  collection: T
): T {
  if (!collection?.features) return collection
  return {
    ...collection,
    features: collection.features.map((f) => {
      const props = f.properties ?? {}
      const nameEn = typeof props.name_en === 'string' ? props.name_en : null
      const existing = typeof props.name_ur === 'string' ? props.name_ur : null
      const name_ur = enrichDistrictNameUr(nameEn, existing)
      return {
        ...f,
        properties: {
          ...props,
          name_ur,
          display_name_en: nameEn,
          display_name_ur: name_ur ?? nameEn,
        },
      }
    }),
  }
}

export type LocalizedAlertText = {
  title: string
  event: string
  headline: string
  instructions: string
}

export function localizeAlertFields(
  locale: string | null | undefined,
  row: {
    title?: string | null
    description?: string | null
    event_en?: string | null
    event_ur?: string | null
    headline_en?: string | null
    headline_ur?: string | null
    instructions_en?: string | null
    instructions_ur?: string | null
  }
): LocalizedAlertText {
  return {
    title: pickLocalized(locale, row.headline_en ?? row.title, row.headline_ur, row.title ?? '—'),
    event: pickLocalized(locale, row.event_en, row.event_ur, row.title ?? '—'),
    headline: pickLocalized(locale, row.headline_en ?? row.title, row.headline_ur, row.title ?? '—'),
    instructions: pickLocalized(locale, row.instructions_en, row.instructions_ur, ''),
  }
}

export function workflowLabel(
  t: TranslateFn,
  from: string,
  to: string
): string {
  if (to === 'issued') return t('workflow.issueAlert')
  if (from === 'pending' && to === 'draft') return t('workflow.startDrafting')
  if (from === 'draft' && to === 'pending_approval') return t('workflow.submitForApproval')
  if (from === 'pending_approval' && to === 'draft') return t('workflow.returnToDraft')
  if (to === 'dismissed') return t('workflow.dismiss')
  if (to === 'cancelled') return t('workflow.cancel')
  if (to === 'expired') return t('workflow.markExpired')
  try {
    return t('workflow.transition', { from, to })
  } catch {
    return `${from} → ${to}`
  }
}
