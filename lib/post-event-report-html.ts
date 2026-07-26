import { actionLabel, formatAuditTimestamp, formatDetail } from '@/lib/audit'
import { CHANNEL_LABELS } from '@/lib/dissemination'
import {
  reportHeadline,
  severityTone,
  type PostEventReportData,
} from '@/lib/post-event-report'

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function field(label: string, innerHtml: string): string {
  return `<div style="break-inside:avoid">
    <div style="font-size:9px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin-bottom:2px">${esc(label)}</div>
    <div style="font-size:12px;color:#0f172a;line-height:1.45">${innerHtml}</div>
  </div>`
}

function section(number: string, title: string, innerHtml: string): string {
  return `<section style="margin-bottom:18px;break-inside:avoid">
    <div style="display:flex;align-items:baseline;gap:8px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin-bottom:10px">
      <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;font-weight:700;color:#1e3a5f">${esc(number)}</span>
      <h2 style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#1e3a5f">${esc(title)}</h2>
    </div>
    ${innerHtml}
  </section>`
}

/** Report body HTML (inline styles) — shared by print page + PDF route. */
export function buildPostEventReportBodyHtml(data: PostEventReportData): string {
  const a = data.alert
  const status = String(a.status ?? '—')
  const severity = String(a.severity ?? '—')
  const tone = severityTone(severity)
  const headline = reportHeadline(data)
  const location = data.districtName
    ? `${data.districtName}${data.province ? `, ${data.province}` : ''}`
    : 'Provincial / multi-district'

  const factCards = [
    { label: 'Status', value: status.toUpperCase() },
    { label: 'Severity', value: severity.toUpperCase(), highlight: true },
    { label: 'District', value: location },
    {
      label: 'Issued',
      value: data.lifecycle.issuedAt
        ? formatAuditTimestamp(data.lifecycle.issuedAt)
        : 'Not issued',
    },
  ]
    .map((card) => {
      const border = card.highlight ? tone.border : '#e2e8f0'
      const bg = card.highlight ? tone.bg : '#f8fafc'
      const fg = card.highlight ? tone.fg : '#0f172a'
      const labelFg = card.highlight ? tone.fg : '#64748b'
      return `<div style="border:1px solid ${border};background:${bg};border-radius:4px;padding:10px 10px 8px">
        <div style="font-size:8px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${labelFg}">${esc(card.label)}</div>
        <div style="margin-top:4px;font-size:11px;font-weight:700;color:${fg};line-height:1.35;word-break:break-word">${esc(card.value)}</div>
      </div>`
    })
    .join('')

  const detection = section(
    '01',
    'Detection',
    `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:10px">
      ${field('Metric', esc(a.metric_name ?? '—'))}
      ${field('Observed value', `<span style="font-family:ui-monospace,Menlo,monospace">${esc(a.observed_value ?? '—')}</span>`)}
      ${field('Threshold', `<span style="font-family:ui-monospace,Menlo,monospace">${esc(a.threshold_value ?? '—')}</span>`)}
      ${field('Detected at', esc(data.lifecycle.detectedAt ? formatAuditTimestamp(data.lifecycle.detectedAt) : '—'))}
      ${field(
        'Valid window',
        esc(
          a.starts_at || a.ends_at
            ? `${a.starts_at ? formatAuditTimestamp(String(a.starts_at)) : '—'} → ${
                a.ends_at ? formatAuditTimestamp(String(a.ends_at)) : '—'
              }`
            : '—'
        )
      )}
      ${field('External ID', `<span style="font-family:ui-monospace,Menlo,monospace;font-size:10px">${esc(a.external_id ?? '—')}</span>`)}
    </div>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:10px 12px;font-size:12px;line-height:1.5;color:#334155">${esc(a.description ?? 'No detection narrative recorded.')}</div>`
  )

  const urHeadline =
    a.headline_ur || a.event_ur
      ? `<div style="margin-bottom:10px">${field(
          'Headline / event (UR)',
          `<span dir="rtl" style="display:block;text-align:right">${esc(a.headline_ur || a.event_ur)}</span>`
        )}</div>`
      : ''

  const urInstructions = a.instructions_ur
    ? `<div style="margin-top:10px">${field(
        'Public instructions (UR)',
        `<div dir="rtl" style="white-space:pre-wrap;background:#fff;border:1px solid #e2e8f0;border-radius:4px;padding:10px 12px;margin-top:4px;text-align:right">${esc(a.instructions_ur)}</div>`
      )}</div>`
    : ''

  const cap = section(
    '02',
    'CAP message',
    `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:10px">
      ${field('Event (EN)', esc(a.event_en ?? a.title ?? '—'))}
      ${field('Urgency', esc(String(a.urgency ?? '—').toUpperCase()))}
      ${field('Certainty', esc(String(a.certainty ?? '—').toUpperCase()))}
    </div>
    ${urHeadline}
    ${field(
      'Public instructions (EN)',
      `<div style="white-space:pre-wrap;background:#fff;border:1px solid #e2e8f0;border-radius:4px;padding:10px 12px;margin-top:4px">${esc(a.instructions_en || '—')}</div>`
    )}
    ${urInstructions}`
  )

  const approval = section(
    '03',
    'Approval & issue',
    `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${field('Issued by', esc(data.issuerName ?? '—'))}
      ${field(
        'Issued at',
        esc(
          data.lifecycle.issuedAt
            ? formatAuditTimestamp(data.lifecycle.issuedAt)
            : 'Not yet issued'
        )
      )}
      ${field(
        'First dispatch',
        esc(
          data.lifecycle.firstDispatchAt
            ? formatAuditTimestamp(data.lifecycle.firstDispatchAt)
            : '—'
        )
      )}
      ${field(
        'First acknowledgement',
        esc(
          data.lifecycle.firstAckAt
            ? formatAuditTimestamp(data.lifecycle.firstAckAt)
            : '—'
        )
      )}
    </div>`
  )

  let disseminationInner: string
  if (data.deliveryStats) {
    const kpis = [
      ['Est. reach', data.deliveryStats.estimatedReach.toLocaleString()],
      ['Deliveries', String(data.deliveryStats.total)],
      [
        'Delivered+',
        String(data.deliveryStats.delivered + data.deliveryStats.acknowledged),
      ],
      ['Acknowledged', String(data.deliveryStats.acknowledged)],
      ['Ack rate', `${data.deliveryStats.ackRate}%`],
    ]
      .map(
        ([label, val]) => `<div style="text-align:center;border:1px solid #e2e8f0;border-radius:4px;padding:8px 4px;background:#f8fafc">
        <div style="font-size:16px;font-weight:700;color:#143222">${esc(val)}</div>
        <div style="font-size:8px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;margin-top:2px">${esc(label)}</div>
      </div>`
      )
      .join('')

    const pipeline =
      data.deliveryStats.failed > 0 || data.deliveryStats.queued > 0
        ? `<p style="font-size:11px;color:#64748b;margin:0 0 10px">Pipeline: ${data.deliveryStats.queued} queued · ${data.deliveryStats.sent} sent · ${data.deliveryStats.failed} failed</p>`
        : ''

    const channelRows = data.channels
      .map(
        (c) => `<tr>
        <td style="padding:6px 4px;border-bottom:1px solid #f1f5f9">${esc(CHANNEL_LABELS[c.channel] ?? c.channel)}</td>
        <td style="padding:6px 4px;border-bottom:1px solid #f1f5f9;text-align:right;font-family:ui-monospace,Menlo,monospace">${esc(Number(c.recipient_count).toLocaleString())}</td>
      </tr>`
      )
      .join('')

    const channelTable =
      data.channels.length > 0
        ? `<table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr>
          <th style="text-align:left;border-bottom:1px solid #cbd5e1;padding:6px 4px;color:#64748b;font-size:9px;letter-spacing:0.06em;text-transform:uppercase">Channel</th>
          <th style="text-align:right;border-bottom:1px solid #cbd5e1;padding:6px 4px;color:#64748b;font-size:9px;letter-spacing:0.06em;text-transform:uppercase">Demo recipients</th>
        </tr></thead>
        <tbody>${channelRows}</tbody>
      </table>`
        : ''

    disseminationInner = `<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:12px">${kpis}</div>${pipeline}${channelTable}`
  } else {
    disseminationInner =
      '<p style="font-size:12px;color:#64748b;margin:0">No dissemination records for this alert yet.</p>'
  }

  const dissemination = section('04', 'Dissemination & acknowledgement', disseminationInner)

  const timelineRows = data.auditLogs
    .map(
      (log) => `<tr style="break-inside:avoid">
      <td style="padding:5px 4px;border-bottom:1px solid #f1f5f9;white-space:nowrap;font-family:ui-monospace,Menlo,monospace;vertical-align:top">${esc(formatAuditTimestamp(log.at))}</td>
      <td style="padding:5px 4px;border-bottom:1px solid #f1f5f9;vertical-align:top;font-weight:600">${esc(actionLabel(log.action))}</td>
      <td style="padding:5px 4px;border-bottom:1px solid #f1f5f9;color:#475569;vertical-align:top">${esc(formatDetail(log.detail) || log.actor_role || '—')}</td>
    </tr>`
    )
    .join('')

  const timeline = section(
    '05',
    'Event timeline',
    data.auditLogs.length === 0
      ? '<p style="font-size:12px;color:#64748b;margin:0">No audit events recorded.</p>'
      : `<table style="width:100%;border-collapse:collapse;font-size:10px">
      <thead><tr>
        <th style="text-align:left;border-bottom:1px solid #cbd5e1;padding:6px 4px;color:#64748b;font-size:9px;letter-spacing:0.06em;text-transform:uppercase">Time (PKT)</th>
        <th style="text-align:left;border-bottom:1px solid #cbd5e1;padding:6px 4px;color:#64748b;font-size:9px;letter-spacing:0.06em;text-transform:uppercase">Event</th>
        <th style="text-align:left;border-bottom:1px solid #cbd5e1;padding:6px 4px;color:#64748b;font-size:9px;letter-spacing:0.06em;text-transform:uppercase">Detail</th>
      </tr></thead>
      <tbody>${timelineRows}</tbody>
    </table>`
  )

  return `<div data-report-ready="true" style="font-family:Segoe UI,system-ui,-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;color:#0f172a;background:#ffffff;max-width:190mm;margin:0 auto">
  <header style="background:#143222;color:#ffffff;padding:18px 20px 16px;border-radius:4px;margin-bottom:16px">
    <div style="display:flex;justify-content:space-between;gap:16px">
      <div>
        <div style="font-size:9px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;opacity:0.75">Nigheban Early Warning System</div>
        <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;line-height:1.2">Post-Event Report</h1>
        <p style="margin:6px 0 0;font-size:12px;opacity:0.9;max-width:420px">${esc(headline)}</p>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="display:inline-block;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.25);border-radius:4px;padding:8px 10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px">
          <div style="opacity:0.7;font-size:8px;letter-spacing:0.12em">REF</div>
          <div style="font-weight:700">NGB-${esc(data.shortRef)}</div>
        </div>
        <div style="margin-top:8px;font-size:10px;opacity:0.75">Generated ${esc(data.generatedAt)}</div>
      </div>
    </div>
  </header>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:18px">${factCards}</div>

  ${detection}
  ${cap}
  ${approval}
  ${dissemination}
  ${timeline}

  <footer style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;gap:12px;font-size:9px;color:#94a3b8">
    <div>Finova Solutions · Nigheban EWS · Append-only audit trail · CAP 1.2</div>
    <div style="font-family:ui-monospace,Menlo,monospace">Alert ${esc(a.id)} · NGB-${esc(data.shortRef)}</div>
  </footer>
</div>`
}

export function wrapReportHtml(bodyMarkup: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Nigheban Post-Event Report</title>
  <style>
    @page { size: A4; margin: 14mm 12mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  </style>
</head>
<body>
${bodyMarkup}
</body>
</html>`
}
