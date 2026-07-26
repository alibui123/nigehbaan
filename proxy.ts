import createIntlMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const handleI18nRouting = createIntlMiddleware({
  locales: ['en', 'ur'],
  defaultLocale: 'en'
});

export default async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

  if (!supabaseUrl.startsWith('http') || !anonKey) {
    return new NextResponse(
      [
        'Server misconfigured: set NEXT_PUBLIC_SUPABASE_URL to the full URL',
        '(https://YOUR_PROJECT.supabase.co) and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel.',
        `Current URL value looks like: ${supabaseUrl ? supabaseUrl.slice(0, 48) : '(empty)'}`,
      ].join(' '),
      { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } }
    )
  }

  const intlResponse = handleI18nRouting(request);
  return await updateSession(request, intlResponse);
}

export const config = {
  matcher: [
    '/',
    '/(en|ur)/:path*',
    '/((?!api|_next|_vercel|.*\\..*).*)'
  ]
};
