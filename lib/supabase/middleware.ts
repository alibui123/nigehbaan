import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest, response: NextResponse) {
  let sessionResponse = response

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          cookiesToSet.forEach(({ name, value, options }) =>
            sessionResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session cookies onto sessionResponse when needed.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const pathWithoutLocale = pathname.replace(/^\/(en|ur)/, '') || '/'

  // Not logged in and trying to reach a protected page -> localized login
  if (
    !user &&
    !pathWithoutLocale.startsWith('/login') &&
    !pathWithoutLocale.startsWith('/api') &&
    pathWithoutLocale !== '/'
  ) {
    const url = request.nextUrl.clone()
    const localeMatch = pathname.match(/^\/(en|ur)/)
    const localePrefix = localeMatch ? localeMatch[0] : '/en'
    url.pathname = `${localePrefix}/login`

    const redirectResponse = NextResponse.redirect(url)
    // Keep next-intl + any refreshed auth cookies on the redirect response.
    sessionResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value)
    })
    return redirectResponse
  }

  return sessionResponse
}
