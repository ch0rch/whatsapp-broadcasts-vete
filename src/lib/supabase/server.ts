import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * RSC / Route Handler Supabase client.
 * Uses async cookies() — required by Next.js 15.
 * Reads and writes session cookies transparently.
 *
 * Use this in:
 *   - Server Components
 *   - Route Handlers (GET / POST)
 *   - Server Actions
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // setAll called from a Server Component — cookies are read-only.
            // Session refresh will still work via the middleware.
          }
        },
      },
    },
  )
}
