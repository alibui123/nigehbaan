import PDFDocument from 'pdfkit'
import { actionLabel, formatAuditTimestamp, formatDetail } from '@/lib/audit'
import { CHANNEL_LABELS } from '@/lib/dissemination'
import {
  reportFilename,
  reportHeadline,
  severityTone,
  type PostEventReportData,
} from '@/lib/post-event-report'

function str(value: unknown, fallback = '—'): string {
  if (value == null || value === '') return fallback
  return String(value)
}

/** Build a Post-Event Report PDF buffer without Chromium (Vercel-safe). */
export async function buildPostEventReportPdf(
  data: PostEventReportData
): Promise<{ buffer: Buffer; filename: string }> {
  const doc = new PDFDocument({
    size: 'A4',
    bufferPages: true,
    margins: { top: 42, bottom: 54, left: 42, right: 42 },
    info: {
      Title: `Nigheban Post-Event Report NGB-${data.shortRef}`,
      Author: 'Nigheban EWS',
      Subject: reportHeadline(data),
    },
  })

  const chunks: Buffer[] = []
  doc.on('data', (chunk: Buffer) => chunks.push(chunk))

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  const a = data.alert
  const headline = reportHeadline(data)
  const severity = str(a.severity).toUpperCase()
  const status = str(a.status).toUpperCase()
  const tone = severityTone(String(a.severity ?? ''))
  const location = data.districtName
    ? `${data.districtName}${data.province ? `, ${data.province}` : ''}`
    : 'Provincial / multi-district'

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
  let y = doc.page.margins.top

  const ensureSpace = (need: number) => {
    const bottom = doc.page.height - doc.page.margins.bottom
    if (y + need > bottom) {
      doc.addPage()
      y = doc.page.margins.top
    }
  }

  const sectionTitle = (num: string, title: string) => {
    ensureSpace(36)
    doc
      .fillColor('#1e3a5f')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(`${num}  ${title.toUpperCase()}`, doc.page.margins.left, y)
    y = doc.y + 4
    doc
      .strokeColor('#e2e8f0')
      .lineWidth(1)
      .moveTo(doc.page.margins.left, y)
      .lineTo(doc.page.margins.left + pageWidth, y)
      .stroke()
    y += 10
  }

  const field = (label: string, value: string, x: number, width: number) => {
    doc
      .fillColor('#64748b')
      .font('Helvetica-Bold')
      .fontSize(7)
      .text(label.toUpperCase(), x, y, { width, lineBreak: false })
    doc
      .fillColor('#0f172a')
      .font('Helvetica')
      .fontSize(10)
      .text(value || '—', x, y + 10, { width })
  }

  // Cover band
  doc.rect(doc.page.margins.left, y, pageWidth, 72).fill('#143222')
  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(8)
    .text('NIGHEBAN EARLY WARNING SYSTEM', doc.page.margins.left + 14, y + 12, {
      width: pageWidth - 120,
    })
  doc
    .fontSize(18)
    .text('Post-Event Report', doc.page.margins.left + 14, y + 26, {
      width: pageWidth - 120,
    })
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#d1fae5')
    .text(headline, doc.page.margins.left + 14, y + 48, {
      width: pageWidth - 130,
      lineBreak: false,
      ellipsis: true,
    })

  const refX = doc.page.margins.left + pageWidth - 100
  doc.roundedRect(refX, y + 12, 88, 36, 3).fillOpacity(0.15).fill('#ffffff').fillOpacity(1)
  doc
    .fillColor('#ffffff')
    .font('Helvetica')
    .fontSize(7)
    .text('REF', refX + 8, y + 16)
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(`NGB-${data.shortRef}`, refX + 8, y + 28)
  y += 84

  doc
    .fillColor('#94a3b8')
    .font('Helvetica')
    .fontSize(8)
    .text(`Generated ${data.generatedAt}`, doc.page.margins.left, y)
  y += 16

  // Key facts
  const cardW = (pageWidth - 18) / 4
  const facts: [string, string, boolean?][] = [
    ['Status', status],
    ['Severity', severity, true],
    ['District', location],
    [
      'Issued',
      data.lifecycle.issuedAt ? formatAuditTimestamp(data.lifecycle.issuedAt) : 'Not issued',
    ],
  ]
  facts.forEach(([label, value, highlight], i) => {
    const x = doc.page.margins.left + i * (cardW + 6)
    doc
      .roundedRect(x, y, cardW, 44, 3)
      .fillAndStroke(highlight ? tone.bg : '#f8fafc', highlight ? tone.border : '#e2e8f0')
    doc
      .fillColor(highlight ? tone.fg : '#64748b')
      .font('Helvetica-Bold')
      .fontSize(7)
      .text(label.toUpperCase(), x + 8, y + 8, { width: cardW - 16 })
    doc
      .fillColor(highlight ? tone.fg : '#0f172a')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(value, x + 8, y + 20, { width: cardW - 16, height: 18, ellipsis: true })
  })
  y += 56

  // 01 Detection
  sectionTitle('01', 'Detection')
  const col = pageWidth / 3
  const row1Y = y
  field('Metric', str(a.metric_name), doc.page.margins.left, col - 8)
  field('Observed', str(a.observed_value), doc.page.margins.left + col, col - 8)
  field('Threshold', str(a.threshold_value), doc.page.margins.left + col * 2, col - 8)
  y = row1Y + 32
  field(
    'Detected at',
    data.lifecycle.detectedAt ? formatAuditTimestamp(data.lifecycle.detectedAt) : '—',
    doc.page.margins.left,
    col - 8
  )
  field(
    'Valid window',
    a.starts_at || a.ends_at
      ? `${a.starts_at ? formatAuditTimestamp(String(a.starts_at)) : '—'} → ${
          a.ends_at ? formatAuditTimestamp(String(a.ends_at)) : '—'
        }`
      : '—',
    doc.page.margins.left + col,
    col * 2 - 8
  )
  y += 36
  ensureSpace(50)
  doc.roundedRect(doc.page.margins.left, y, pageWidth, 1, 0).stroke('#e2e8f0')
  doc
    .fillColor('#334155')
    .font('Helvetica')
    .fontSize(10)
    .text(str(a.description, 'No detection narrative recorded.'), doc.page.margins.left, y, {
      width: pageWidth,
    })
  y = doc.y + 14

  // 02 CAP
  sectionTitle('02', 'CAP message')
  const capY = y
  field('Event (EN)', str(a.event_en ?? a.title), doc.page.margins.left, col - 8)
  field('Urgency', str(a.urgency).toUpperCase(), doc.page.margins.left + col, col - 8)
  field('Certainty', str(a.certainty).toUpperCase(), doc.page.margins.left + col * 2, col - 8)
  y = capY + 34
  ensureSpace(60)
  doc
    .fillColor('#64748b')
    .font('Helvetica-Bold')
    .fontSize(7)
    .text('PUBLIC INSTRUCTIONS (EN)', doc.page.margins.left, y)
  y += 12
  doc
    .fillColor('#0f172a')
    .font('Helvetica')
    .fontSize(10)
    .text(str(a.instructions_en), doc.page.margins.left, y, { width: pageWidth })
  y = doc.y + 14

  // 03 Approval
  sectionTitle('03', 'Approval & issue')
  const apY = y
  field('Issued by', str(data.issuerName), doc.page.margins.left, pageWidth / 2 - 8)
  field(
    'Issued at',
    data.lifecycle.issuedAt ? formatAuditTimestamp(data.lifecycle.issuedAt) : 'Not yet issued',
    doc.page.margins.left + pageWidth / 2,
    pageWidth / 2 - 8
  )
  y = apY + 32
  field(
    'First dispatch',
    data.lifecycle.firstDispatchAt
      ? formatAuditTimestamp(data.lifecycle.firstDispatchAt)
      : '—',
    doc.page.margins.left,
    pageWidth / 2 - 8
  )
  field(
    'First acknowledgement',
    data.lifecycle.firstAckAt ? formatAuditTimestamp(data.lifecycle.firstAckAt) : '—',
    doc.page.margins.left + pageWidth / 2,
    pageWidth / 2 - 8
  )
  y += 36

  // 04 Dissemination
  sectionTitle('04', 'Dissemination & acknowledgement')
  if (data.deliveryStats) {
    const kpis: [string, string][] = [
      ['Est. reach', data.deliveryStats.estimatedReach.toLocaleString()],
      ['Deliveries', String(data.deliveryStats.total)],
      [
        'Delivered+',
        String(data.deliveryStats.delivered + data.deliveryStats.acknowledged),
      ],
      ['Acknowledged', String(data.deliveryStats.acknowledged)],
      ['Ack rate', `${data.deliveryStats.ackRate}%`],
    ]
    const kpiW = (pageWidth - 24) / 5
    ensureSpace(50)
    kpis.forEach(([label, val], i) => {
      const x = doc.page.margins.left + i * (kpiW + 6)
      doc.roundedRect(x, y, kpiW, 40, 3).fillAndStroke('#f8fafc', '#e2e8f0')
      doc
        .fillColor('#143222')
        .font('Helvetica-Bold')
        .fontSize(12)
        .text(val, x, y + 8, { width: kpiW, align: 'center' })
      doc
        .fillColor('#64748b')
        .font('Helvetica-Bold')
        .fontSize(6)
        .text(label.toUpperCase(), x, y + 26, { width: kpiW, align: 'center' })
    })
    y += 52

    if (data.channels.length > 0) {
      ensureSpace(24 + data.channels.length * 16)
      doc
        .fillColor('#64748b')
        .font('Helvetica-Bold')
        .fontSize(7)
        .text('CHANNEL', doc.page.margins.left, y)
        .text('DEMO RECIPIENTS', doc.page.margins.left + pageWidth - 100, y, {
          width: 100,
          align: 'right',
        })
      y += 12
      data.channels.forEach((c) => {
        doc
          .fillColor('#0f172a')
          .font('Helvetica')
          .fontSize(9)
          .text(CHANNEL_LABELS[c.channel] ?? c.channel, doc.page.margins.left, y)
          .text(Number(c.recipient_count).toLocaleString(), doc.page.margins.left + pageWidth - 100, y, {
            width: 100,
            align: 'right',
          })
        y += 14
      })
      y += 8
    }
  } else {
    doc
      .fillColor('#64748b')
      .font('Helvetica')
      .fontSize(10)
      .text('No dissemination records for this alert yet.', doc.page.margins.left, y)
    y += 20
  }

  // 05 Timeline
  sectionTitle('05', 'Event timeline')
  if (data.auditLogs.length === 0) {
    doc
      .fillColor('#64748b')
      .font('Helvetica')
      .fontSize(10)
      .text('No audit events recorded.', doc.page.margins.left, y)
  } else {
    ensureSpace(20)
    doc
      .fillColor('#64748b')
      .font('Helvetica-Bold')
      .fontSize(7)
      .text('TIME (PKT)', doc.page.margins.left, y)
      .text('EVENT', doc.page.margins.left + 120, y)
      .text('DETAIL', doc.page.margins.left + 280, y)
    y += 12
    data.auditLogs.forEach((log) => {
      const detail = formatDetail(log.detail) || log.actor_role || '—'
      const event = actionLabel(log.action)
      const time = formatAuditTimestamp(log.at)
      // Estimate height
      const detailHeight = doc.heightOfString(detail, { width: pageWidth - 280 })
      ensureSpace(Math.max(16, detailHeight + 6))
      doc
        .fillColor('#0f172a')
        .font('Helvetica')
        .fontSize(8)
        .text(time, doc.page.margins.left, y, { width: 110 })
      doc.font('Helvetica-Bold').text(event, doc.page.margins.left + 120, y, { width: 150 })
      doc
        .font('Helvetica')
        .fillColor('#475569')
        .text(detail, doc.page.margins.left + 280, y, { width: pageWidth - 280 })
      y = Math.max(y + 14, doc.y + 4)
    })
  }

  // Footer on each page
  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i)
    const footerY = doc.page.height - 36
    doc
      .fillColor('#94a3b8')
      .font('Helvetica')
      .fontSize(7)
      .text(
        `Finova Solutions · Nigheban EWS · CAP 1.2 · NGB-${data.shortRef}`,
        doc.page.margins.left,
        footerY,
        { lineBreak: false }
      )
      .text(`Page ${i + 1} / ${range.count}`, doc.page.margins.left, footerY, {
        width: pageWidth,
        align: 'right',
        lineBreak: false,
      })
  }

  doc.end()
  const buffer = await done
  return { buffer, filename: reportFilename(data) }
}
