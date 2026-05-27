/**
 * POST /api/crm/customers/lookup
 *
 * HMAC-signed agent-tool endpoint. Called by the Kapso workflow's lookup_customer tool.
 * Auth: X-Kapso-Signature header (HMAC-SHA256 using KAPSO_AGENT_TOOL_SECRET).
 * Uses service-role client — bypasses RLS; clinic_id is resolved from the clinic's
 * whatsapp_phone_number_id passed in the request body.
 *
 * Input: { phone_number: string, phone_number_id?: string }
 * Output: { found: true, customer_id, name, pets: [...] } | { found: false }
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyHmacSignature } from '@/lib/webhook-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { lookupByPhone } from '@/server/customers/repo'
import { env } from '@/env'

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-kapso-signature')
  const agentSecret = env.KAPSO_AGENT_TOOL_SECRET as string

  // Verify HMAC signature
  const valid = await verifyHmacSignature(rawBody, signature, agentSecret)
  if (!valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { phone_number: string; phone_number_id?: string }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { phone_number, phone_number_id } = body

  if (!phone_number) {
    return NextResponse.json({ error: 'phone_number is required' }, { status: 400 })
  }

  // Resolve clinic_id from whatsapp_phone_number_id
  if (!phone_number_id) {
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
      next_vaccine_due: p.next_vaccine_due ?? null,
    })),
  })
}
