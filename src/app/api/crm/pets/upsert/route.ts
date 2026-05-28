/**
 * POST /api/crm/pets/upsert
 *
 * Bearer-token agent-tool endpoint. Called by the Kapso workflow's upsert_pet tool.
 * Auth: `Authorization: Bearer ${KAPSO_AGENT_TOOL_SECRET}` (Kapso flow_agent_webhooks
 * only support static headers, so HMAC body-signing is not possible).
 *
 * Design decision: REQUIRES the customer to exist (identified by phone_number).
 * The agent flow should call lookup_customer first; if the customer doesn't exist
 * the agent creates it via a separate flow step (or the vet does it manually).
 *
 * Input:  { phone_number, phone_number_id, name, species, breed?, birth_year?, weight_kg?, notes? }
 * Output: { pet_id: string, action: 'created' | 'updated' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyBearerToken } from '@/lib/agent-tool-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { upsertPet, VALID_SPECIES, type Species } from '@/server/pets/repo'
import { env } from '@/env'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const agentSecret = env.KAPSO_AGENT_TOOL_SECRET as string

  if (!verifyBearerToken(authHeader, agentSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rawBody = await request.text()
  console.log('[upsert_pet] rx', { event: 'rx', body: rawBody })

  // Accept the field names the LLM naturally produces ('age' / 'weight') in addition
  // to the canonical ones ('birth_year' / 'weight_kg'), and treat phone_number as
  // optional so the endpoint can fall back to the most recently active customer in
  // the single-tenant clinic when the LLM omits it for pet calls.
  let body: {
    phone_number?: string
    phone_number_id?: string
    name: string
    species: string
    breed?: string
    birth_year?: number
    age?: number
    weight_kg?: number | string
    weight?: number | string
    notes?: string
  }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { phone_number, phone_number_id, name, species, breed, notes } = body
  const birth_year = body.birth_year ?? (body.age ? new Date().getFullYear() - body.age : undefined)
  const weight_kg = body.weight_kg !== undefined ? Number(body.weight_kg) : body.weight !== undefined ? Number(body.weight) : undefined

  if (!name || !species) {
    console.warn('[upsert_pet] reject: missing required fields', { event: 'reject', body })
    return NextResponse.json(
      { error: 'name and species are required' },
      { status: 400 },
    )
  }

  if (!VALID_SPECIES.includes(species as Species)) {
    return NextResponse.json(
      { error: 'INVALID_SPECIES', message: `species must be one of: ${VALID_SPECIES.join(', ')}` },
      { status: 422 },
    )
  }

  // Resolve clinic_id: prefer the supplied whatsapp_phone_number_id; otherwise fall
  // back to the single-tenant clinic (MVP). TODO multi-tenant: require phone_number_id.
  const admin = createAdminClient()
  const clinicQuery = admin.from('clinics').select('id')
  const { data: clinic } = phone_number_id
    ? await clinicQuery.eq('whatsapp_phone_number_id', phone_number_id).maybeSingle()
    : await clinicQuery.limit(1).maybeSingle()

  if (!clinic) {
    return NextResponse.json({ error: 'Clinic not resolved' }, { status: 404 })
  }

  // Resolve customer: prefer phone_number when the LLM supplied it; otherwise fall
  // back to the most-recently-updated customer in this clinic (works for the
  // single-active-conversation MVP because Kapso's webhook tool only carries
  // {{vars.*}} and {{context.phone_number}} — the LLM rarely re-emits
  // phone_number for pet calls). Race-condition risk for multi-tenant or
  // concurrent registrations; revisit if pilot uncovers issues.
  const customerQuery = admin
    .from('customers')
    .select('id, phone_number')
    .eq('clinic_id', clinic.id)
    .is('deleted_at', null)
  const { data: customer } = phone_number
    ? await customerQuery.eq('phone_number', phone_number).maybeSingle()
    : await customerQuery.order('updated_at', { ascending: false }).limit(1).maybeSingle()

  if (!customer) {
    console.warn('[upsert_pet] reject: no resolvable customer', { event: 'reject', reason: 'no_customer', phone_number })
    return NextResponse.json(
      { error: 'CUSTOMER_NOT_FOUND', message: 'No customer found. Call lookup_customer or upsert_customer first.' },
      { status: 404 },
    )
  }

  // Convert birth_year to approximate birth_date (Jan 1 of that year)
  const birth_date = birth_year ? `${birth_year}-01-01` : undefined

  try {
    const result = await upsertPet({
      clinic_id: clinic.id,
      customer_id: customer.id,
      name,
      species: species as Species,
      breed: breed ?? null,
      birth_date: birth_date ?? null,
      weight_kg: weight_kg ?? null,
      health_notes: notes ?? null,
    })

    return NextResponse.json({ pet_id: result.pet_id, action: result.action })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
