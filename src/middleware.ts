import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/login']

// Routes that should be completely bypassed (webhooks, cron, health)
const BYPASS_PREFIXES = [
  '/api/webhooks/',
  '/api/cron/',
  '/api/health',
]

function isBypassRoute(pathname: string): boolean {
  return BYPASS_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(route + '/'))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Let webhook/cron/health routes through without any auth check
  if (isBypassRoute(pathname)) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Refresh the session (keeps token alive)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Unauthenticated user hitting a protected route → redirect to /login
  if (!user && !isPublicRoute(pathname)) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated user hitting /login → redirect to dashboard
  if (user && isPublicRoute(pathname)) {
    const dashboardUrl = request.nextUrl.clone()
    dashboardUrl.pathname = '/'
    dashboardUrl.searchParams.delete('next')
    return NextResponse.redirect(dashboardUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public folder files (svg, png, jpg, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
