/**
 * POST /api/crm/customers/opt-in
 *
 * HMAC-signed agent-tool endpoint. Called by the Kapso workflow's mark_opt_in tool.
 * Auth: X-Kapso-Signature header (HMAC-SHA256 using KAPSO_AGENT_TOOL_SECRET).
 * Uses service-role client — bypasses RLS; clinic_id resolved from phone_number_id.
 *
 * Input: { phone_number: string, phone_number_id?: string }
 * Output: { success: true } | error
 *
 * Effects:
 *   1. UPDATE customers SET opted_out_at = NULL WHERE (clinic_id, phone_number)
 *   2. INSERT opt_out_events audit row (triggered_by='opt_in') — schema supports it.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyHmacSignature } from '@/lib/webhook-auth'
import { normalizeAndValidate } from '@/lib/phone-normalizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { env } from '@/env'

export async function POST(request: NextRequest) {
  // 1. Read raw body ONCE — required for HMAC verification
  const rawBody = await request.text()
  const signature = request.headers.get('x-kapso-signature')
  const agentSecret = env.KAPSO_AGENT_TOOL_SECRET

  // 2. Verify HMAC signature
  const valid = await verifyHmacSignature(rawBody, signature, agentSecret)
  if (!valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 3. Parse body
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

  // 4. Normalize phone number to E.164
  const normalized = normalizeAndValidate(phone_number)
  if (!normalized) {
    return NextResponse.json(
      { error: 'Invalid phone number format. Expected E.164 or Argentine local format.' },
      { status: 422 },
    )
  }

  const admin = createAdminClient()

  // 5. Resolve clinic_id from phone_number_id
  if (!phone_number_id) {
    return NextResponse.json({ error: 'phone_number_id is required' }, { status: 400 })
  }

  const { data: clinic } = await admin
    .from('clinics')
    .select('id')
    .eq('whatsapp_phone_number_id', phone_number_id)
    .single()

  if (!clinic) {
    return NextResponse.json(
      { error: 'Clinic not found for this phone_number_id' },
      { status: 404 },
    )
  }

  const clinicId = clinic.id

  // 6. Find customer by (clinic_id, phone_number)
  const { data: customer } = await admin
    .from('customers')
    .select('id, opted_out_at')
    .eq('clinic_id', clinicId)
    .eq('phone_number', normalized)
    .is('deleted_at', null)
    .single()

  if (!customer) {
    return NextResponse.json(
      { error: 'Customer not found' },
      { status: 404 },
    )
  }

  // 7. Clear opted_out_at
  const now = new Date().toISOString()
  const { error: updateErr } = await admin
    .from('customers')
    .update({ opted_out_at: null, updated_at: now })
    .eq('id', customer.id)

  if (updateErr) {
    console.error('[opt-in] Failed to clear opted_out_at', { error: updateErr, customer_id: customer.id })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  // 8. Insert opt_out_events audit row — triggered_by='opt_in' is valid per schema constraint
  const { error: auditErr } = await admin
    .from('opt_out_events')
    .insert({
      clinic_id: clinicId,
      customer_id: customer.id,
      triggered_by: 'opt_in',
      raw_message: null,
      triggered_at: now,
    })

  if (auditErr) {
    // Audit failure is non-fatal — the opt-in itself succeeded
    console.error('[opt-in] Failed to insert audit row', { error: auditErr, customer_id: customer.id })
  }

  return NextResponse.json({ success: true })
}
