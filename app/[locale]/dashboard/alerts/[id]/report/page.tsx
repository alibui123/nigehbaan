import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { loadPostEventReport } from '@/lib/post-event-report'
import { buildPostEventReportBodyHtml } from '@/lib/post-event-report-html'

export default async function PostEventReportPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const data = await loadPostEventReport(supabase, id)
  if (!data) notFound()

  return (
    <div className="min-h-screen bg-white text-gray-900 print:min-h-0">
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <div
        className="mx-auto max-w-[210mm] p-6 print:p-0 sm:p-8"
        dangerouslySetInnerHTML={{ __html: buildPostEventReportBodyHtml(data) }}
      />
    </div>
  )
}
