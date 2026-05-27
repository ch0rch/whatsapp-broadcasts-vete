import { createClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client.
 * Bypasses RLS. Server-only — NEVER import in client code.
 *
 * Use this in:
 *   - Webhook receivers (/api/webhooks/**)
 *   - Agent tool routes (/api/crm/customers/lookup, /api/crm/pets/upsert, etc.)
 *   - Cron routes (/api/cron/**)
 *
 * The caller is responsible for verifying HMAC signatures BEFORE using this client.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )
}
