/** Twilio Programmable Messaging — SMS and WhatsApp helpers. */

export type TwilioChannel = 'sms' | 'whatsapp'

export interface TwilioCredentials {
  accountSid: string
  authToken: string
}

export interface TwilioSendParams {
  credentials: TwilioCredentials
  channel: TwilioChannel
  from: string
  to: string
  body?: string
  /** Approved WhatsApp template SID (Content Template Builder). */
  contentSid?: string
  contentVariables?: Record<string, string>
}

export interface TwilioSendResult {
  sid: string
  status: string
  errorCode?: number | null
  errorMessage?: string | null
  body?: string | null
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name} in environment`)
  return value
}

/** E.164 or whatsapp:+E164 → whatsapp:+E164 */
export function normalizeWhatsAppAddress(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('whatsapp:')) return trimmed
  const digits = trimmed.startsWith('+') ? trimmed : `+${trimmed.replace(/\D/g, '')}`
  return `whatsapp:${digits}`
}

/** E.164 for SMS (no whatsapp: prefix). */
export function normalizeSmsAddress(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('whatsapp:')) return trimmed.slice('whatsapp:'.length)
  return trimmed.startsWith('+') ? trimmed : `+${trimmed.replace(/\D/g, '')}`
}

export function getTwilioCredentials(): TwilioCredentials {
  return {
    accountSid: requireEnv('TWILIO_ACCOUNT_SID'),
    authToken: requireEnv('TWILIO_AUTH_TOKEN'),
  }
}

export function isTwilioSmsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER &&
    process.env.TWILIO_TO_NUMBER
  )
}

export function isTwilioWhatsAppConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_FROM &&
    process.env.TWILIO_WHATSAPP_TO
  )
}

export function getWhatsAppFrom(): string {
  return normalizeWhatsAppAddress(requireEnv('TWILIO_WHATSAPP_FROM'))
}

export function getWhatsAppTo(): string {
  return normalizeWhatsAppAddress(requireEnv('TWILIO_WHATSAPP_TO'))
}

export async function sendTwilioMessage(params: TwilioSendParams): Promise<TwilioSendResult> {
  const { credentials, channel, from, to, body, contentSid, contentVariables } = params

  const fromAddr = channel === 'whatsapp' ? normalizeWhatsAppAddress(from) : normalizeSmsAddress(from)
  const toAddr = channel === 'whatsapp' ? normalizeWhatsAppAddress(to) : normalizeSmsAddress(to)

  const payload = new URLSearchParams({ From: fromAddr, To: toAddr })

  if (contentSid) {
    payload.set('ContentSid', contentSid)
    if (contentVariables && Object.keys(contentVariables).length > 0) {
      payload.set('ContentVariables', JSON.stringify(contentVariables))
    }
  } else if (body) {
    payload.set('Body', body)
  } else {
    throw new Error('Twilio message requires Body or ContentSid')
  }

  const auth = Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString('base64')
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: payload,
    }
  )

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Twilio ${channel} send failed: ${errText}`)
  }

  const data = (await res.json()) as {
    sid: string
    status: string
    error_code?: number | null
    error_message?: string | null
    body?: string | null
  }
  return {
    sid: data.sid,
    status: data.status,
    errorCode: data.error_code ?? null,
    errorMessage: data.error_message ?? null,
    body: data.body ?? null,
  }
}

/** Poll message resource until terminal status (or timeout). */
export async function waitForTwilioMessageStatus(
  credentials: TwilioCredentials,
  messageSid: string,
  opts?: { attempts?: number; delayMs?: number }
): Promise<TwilioSendResult> {
  const attempts = opts?.attempts ?? 6
  const delayMs = opts?.delayMs ?? 800
  const auth = Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString('base64')
  const url = `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}/Messages/${messageSid}.json`

  let last: TwilioSendResult = { sid: messageSid, status: 'queued' }
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, delayMs))
    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` }, cache: 'no-store' })
    if (!res.ok) continue
    const data = (await res.json()) as {
      sid: string
      status: string
      error_code?: number | null
      error_message?: string | null
      body?: string | null
    }
    last = {
      sid: data.sid,
      status: data.status,
      errorCode: data.error_code ?? null,
      errorMessage: data.error_message ?? null,
      body: data.body ?? null,
    }
    if (['delivered', 'read', 'failed', 'undelivered', 'canceled'].includes(data.status)) {
      return last
    }
  }
  return last
}

/** Human-readable fix for common WhatsApp sandbox / template failures. */
export function explainTwilioWhatsAppFailure(result: TwilioSendResult): string {
  const code = result.errorCode
  if (code === 63016) {
    return (
      'WhatsApp free-form send blocked (Twilio 63016): outside the 24-hour session window. ' +
      'Fix: from your phone, open WhatsApp → message the sandbox number (+14155238886) with the join code ' +
      'from Twilio Console → Messaging → Try WhatsApp. Then retry within 24 hours. ' +
      'Or set TWILIO_WHATSAPP_CONTENT_SID to an approved template SID for business-initiated alerts.'
    )
  }
  if (code === 63007 || code === 63015) {
    return (
      `WhatsApp sandbox recipient not joined (Twilio ${code}). ` +
      'Send the Twilio sandbox join code from TWILIO_WHATSAPP_TO to +14155238886, then retry.'
    )
  }
  return (
    `WhatsApp delivery ${result.status}` +
    (code ? ` (Twilio ${code}` : '') +
    (result.errorMessage ? `: ${result.errorMessage}` : code ? ')' : '') +
    (code ? ')' : '')
  )
}
