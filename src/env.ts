/**
 * Typed environment validator.
 * Validates at ACCESS time, not at import time, so next build
 * succeeds without env vars set (build-time pre-rendering skips runtime errors).
 *
 * Import in server-only code (Server Components, Server Actions, Route Handlers).
 *
 * Usage:
 *   import { env } from '@/env'
 *   const apiKey = env.KAPSO_API_KEY // throws if missing at runtime
 */

function makeEnvProxy() {
  type RequiredKey =
    | 'NEXT_PUBLIC_SUPABASE_URL'
    | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
    | 'SUPABASE_SERVICE_ROLE_KEY'
    | 'KAPSO_API_KEY'
    | 'KAPSO_API_BASE_URL'
    | 'KAPSO_WEBHOOK_SECRET_PROJECT'
    | 'KAPSO_WEBHOOK_SECRET_PHONE_NUMBER'
    | 'KAPSO_AGENT_TOOL_SECRET'
    | 'BUSINESS_ACCOUNT_ID'
    | 'PHONE_NUMBER_ID'
    | 'CRON_SECRET'

  const optional = {
    SENTRY_DSN: '',
  } as const

  type OptionalKey = keyof typeof optional

  type EnvKeys = RequiredKey | OptionalKey

  const handler: ProxyHandler<Record<string, string | undefined>> = {
    get(_target, prop: string) {
      if ((optional as Record<string, string>)[prop] !== undefined) {
        return process.env[prop] ?? (optional as Record<string, string>)[prop]
      }
      const value = process.env[prop as string]
      if (!value) {
        throw new Error(
          `Missing required environment variable: ${prop}\n` +
            `Copy .env.local.example to .env.local and fill in the value.`,
        )
      }
      return value
    },
  }

  return new Proxy({} as Record<EnvKeys, string>, handler)
}

export const env = makeEnvProxy()
