/**
 * POST /api/crm/customers/lookup
 *
 * Bearer-token agent-tool endpoint. Called by the Kapso workflow's lookup_customer tool.
 * Auth: `Authorization: Bearer ${KAPSO_AGENT_TOOL_SECRET}` (Kapso flow_agent_webhooks
 * only support static headers, so HMAC body-signing is not possible).
 * Uses service-role client — bypasses RLS; clinic_id is resolved from the clinic's
 * whatsapp_phone_number_id passed in the request body.
 *
 * Input: { phone_number: string, phone_number_id?: string }
 * Output: { found: true, customer_id, name, pets: [...] } | { found: false }
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyBearerToken } from '@/lib/agent-tool-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { lookupByPhone } from '@/server/customers/repo'
import { env } from '@/env'

/**
 * Compute pet age in whole years from a birth_date string (ISO date).
 * Returns null if birth_date is null or unparseable.
 */
function computeAgeInYears(birthDate: string | null): number | null {
  if (!birthDate) return null
  const birth = new Date(birthDate)
  if (isNaN(birth.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const hasHadBirthdayThisYear =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate())
  if (!hasHadBirthdayThisYear) age -= 1
  return age < 0 ? null : age
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const agentSecret = env.KAPSO_AGENT_TOOL_SECRET as string

  if (!verifyBearerToken(authHeader, agentSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rawBody = await request.text()
  console.log('[lookup_customer] rx', { event: 'rx', body: rawBody })

  let body: { phone_number: string; phone_number_id?: string }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { phone_number, phone_number_id } = body

  if (!phone_number) {
    console.warn('[lookup_customer] reject: missing phone_number', { event: 'reject', reason: 'phone_number_missing', body })
    return NextResponse.json({ error: 'phone_number is required' }, { status: 400 })
  }

  // Resolve clinic_id from whatsapp_phone_number_id
  if (!phone_number_id) {
    console.warn('[lookup_customer] reject: missing phone_number_id', { event: 'reject', reason: 'phone_number_id_missing', body })
    return NextResponse.json({ error: 'phone_number_id is required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: clinic } = await admin
    .from('clinics')
    .select('id')
    .eq('whatsapp_phone_number_id', phone_number_id)
    .single()

  if (!clinic) {
    return NextResponse.json({ error: 'Clinic not found for this phone_number_id' }, { status: 404 })
  }

  const customer = await lookupByPhone(clinic.id, phone_number)

  if (!customer) {
    return NextResponse.json({ found: false })
  }

  return NextResponse.json({
    found: true,
    customer_id: customer.id,
    name: customer.name,
    pets: (customer.pets ?? []).map((p) => ({
      name: p.name,
      species: p.species,
      age: computeAgeInYears(p.birth_date),
      next_vaccine_due: p.next_vaccine_due ?? null,
    })),
  })
}
