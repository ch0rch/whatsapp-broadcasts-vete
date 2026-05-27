/**
 * GET  /api/crm/customers/[id]/pets  — list pets for a customer
 * POST /api/crm/customers/[id]/pets  — add a pet to a customer
 *
 * Auth: Supabase JWT + RLS scoping.
 */

import { NextRequest, NextResponse } from 'next/server'
import { listPetsForCustomer, createPet, VALID_SPECIES, type Species } from '@/server/pets/repo'
import { getCustomer } from '@/server/customers/repo'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: customer_id } = await params
  const { data, error } = await listPetsForCustomer(customer_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: customer_id } = await params
  const body = await request.json()
  const { name, species, breed, birth_date, weight_kg, next_vaccine_due, health_notes } = body

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (!species) {
    return NextResponse.json({ error: 'species is required' }, { status: 400 })
  }
  if (!VALID_SPECIES.includes(species as Species)) {
    return NextResponse.json(
      {
        error: 'INVALID_SPECIES',
        message: `species must be one of: ${VALID_SPECIES.join(', ')}`,
      },
      { status: 422 },
    )
  }

  // Verify the customer exists and belongs to this clinic (via RLS)
  const { error: customerError } = await getCustomer(customer_id)
  if (customerError) {
    if (customerError.code === 'PGRST116') {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }
    return NextResponse.json({ error: customerError.message }, { status: 500 })
  }

  // Get clinic_id from authenticated user's membership
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: membership } = await supabase
    .from('clinic_members')
    .select('clinic_id')
    .eq('user_id', user.id)
    .single()
  if (!membership) {
    return NextResponse.json({ error: 'No clinic membership found' }, { status: 403 })
  }

  const { data, error } = await createPet({
    clinic_id: membership.clinic_id,
    customer_id,
    name,
    species: species as Species,
    breed: breed ?? null,
    birth_date: birth_date ?? null,
    weight_kg: weight_kg ?? null,
    next_vaccine_due: next_vaccine_due ?? null,
    health_notes: health_notes ?? null,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
