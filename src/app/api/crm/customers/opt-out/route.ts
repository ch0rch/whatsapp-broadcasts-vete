/**
 * POST /api/crm/customers/opt-out
 *
 * Bearer-token agent-tool endpoint. Called by the Kapso workflow's mark_opt_out tool.
 * Auth: `Authorization: Bearer ${KAPSO_AGENT_TOOL_SECRET}` (Kapso flow_agent_webhooks
 * only support static headers, so HMAC body-signing is not possible).
 * Uses service-role client — bypasses RLS; clinic_id resolved from phone_number_id.
 *
 * Input: { phone_number: string, phone_number_id?: string, reason?: string }
 * Output: { success: true, confirmation_text: string } | error
 *
 * Effects:
 *   1. UPDATE customers SET opted_out_at = now() WHERE (clinic_id, phone_number)
 *   2. INSERT opt_out_events audit row (triggered_by='inbound_message')
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyBearerToken } from '@/lib/agent-tool-auth'
import { normalizeAndValidate } from '@/lib/phone-normalizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { env } from '@/env'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const agentSecret = env.KAPSO_AGENT_TOOL_SECRET as string

  if (!verifyBearerToken(authHeader, agentSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse body
  let body: { phone_number: string; phone_number_id?: string; reason?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { phone_number, phone_number_id, reason } = body

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

  // 7. Mark opted_out_at = now()
  const now = new Date().toISOString()
  const { error: updateErr } = await admin
    .from('customers')
    .update({ opted_out_at: now, updated_at: now })
    .eq('id', customer.id)

  if (updateErr) {
    console.error('[opt-out] Failed to update opted_out_at', { error: updateErr, customer_id: customer.id })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  // 8. Insert opt_out_events audit row
  const { error: auditErr } = await admin
    .from('opt_out_events')
    .insert({
      clinic_id: clinicId,
      customer_id: customer.id,
      triggered_by: 'inbound_message',
      raw_message: reason ?? null,
      triggered_at: now,
    })

  if (auditErr) {
    // Audit failure is non-fatal — the opt-out itself succeeded
    console.error('[opt-out] Failed to insert audit row', { error: auditErr, customer_id: customer.id })
  }

  // 9. Return voseo confirmation text for the agent to send back to the customer
  return NextResponse.json({
    success: true,
    confirmation_text:
      'Listo, no vas a recibir más mensajes. Si querés volver, respondé ALTA.',
  })
}
