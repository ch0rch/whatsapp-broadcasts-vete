/**
 * POST /api/crm/pets/upsert
 *
 * HMAC-signed agent-tool endpoint. Called by the Kapso workflow's upsert_pet tool.
 * Auth: X-Kapso-Signature header (HMAC-SHA256 using KAPSO_AGENT_TOOL_SECRET).
 *
 * Design decision: REQUIRES the customer to exist (identified by phone_number).
 * The agent flow should call lookup_customer first; if the customer doesn't exist
 * the agent creates it via a separate flow step (or the vet does it manually).
 *
 * Input:  { phone_number, phone_number_id, name, species, breed?, birth_year?, weight_kg?, notes? }
 * Output: { pet_id: string, action: 'created' | 'updated' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyHmacSignature } from '@/lib/webhook-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { upsertPet, VALID_SPECIES, type Species } from '@/server/pets/repo'
import { env } from '@/env'

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-kapso-signature')
  const agentSecret = env.KAPSO_AGENT_TOOL_SECRET as string

  const valid = await verifyHmacSignature(rawBody, signature, agentSecret)
  if (!valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    phone_number: string
    phone_number_id: string
    name: string
    species: string
    breed?: string
    birth_year?: number
    weight_kg?: number
    notes?: string
  }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { phone_number, phone_number_id, name, species, breed, birth_year, weight_kg, notes } = body

  if (!phone_number || !phone_number_id || !name || !species) {
    return NextResponse.json(
      { error: 'phone_number, phone_number_id, name, and species are required' },
      { status: 400 },
    )
  }

  if (!VALID_SPECIES.includes(species as Species)) {
    return NextResponse.json(
      { error: 'INVALID_SPECIES', message: `species must be one of: ${VALID_SPECIES.join(', ')}` },
      { status: 422 },
    )
  }

  const admin = createAdminClient()

  // Resolve clinic_id from whatsapp_phone_number_id
  const { data: clinic } = await admin
    .from('clinics')
    .select('id')
    .eq('whatsapp_phone_number_id', phone_number_id)
    .single()

  if (!clinic) {
    return NextResponse.json({ error: 'Clinic not found for this phone_number_id' }, { status: 404 })
  }

  // Resolve customer by phone_number within the clinic
  const { data: customer } = await admin
    .from('customers')
    .select('id')
    .eq('clinic_id', clinic.id)
    .eq('phone_number', phone_number)
    .is('deleted_at', null)
    .single()

  if (!customer) {
    return NextResponse.json(
      { error: 'CUSTOMER_NOT_FOUND', message: 'No customer found for this phone_number. Call lookup_customer first.' },
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
