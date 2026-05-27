/**
 * GET  /api/crm/customers   — list customers (paginated, optional ?q= search)
 * POST /api/crm/customers   — create customer
 *
 * Auth: Supabase JWT (RLS scopes to clinic_id automatically).
 * Middleware rejects unauthenticated callers with 401 JSON before this runs.
 */

import { NextRequest, NextResponse } from 'next/server'
import { listCustomers, createCustomer } from '@/server/customers/repo'
import { normalizeAndValidate } from '@/lib/phone-normalizer'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const q = searchParams.get('q') ?? undefined
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const pageSize = Math.min(parseInt(searchParams.get('page_size') ?? '50', 10), 100)

  const { data, error, count } = await listCustomers({ q, page, pageSize })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data,
    meta: {
      total: count ?? 0,
      page,
      page_size: pageSize,
      total_pages: Math.ceil((count ?? 0) / pageSize),
    },
  })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, phone_number, email, notes } = body

  if (!phone_number) {
    return NextResponse.json({ error: 'phone_number is required' }, { status: 400 })
  }

  // Normalize phone to E.164
  const normalized = normalizeAndValidate(phone_number)
  if (!normalized) {
    return NextResponse.json(
      { error: 'INVALID_PHONE', message: 'Phone number cannot be normalized to E.164' },
      { status: 422 },
    )
  }

  // Get clinic_id from the authenticated user's membership
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

  const { data, error } = await createCustomer({
    clinic_id: membership.clinic_id,
    phone_number: normalized,
    name: name ?? null,
    email: email ?? null,
    notes: notes ?? null,
  })

  if (error) {
    // Unique constraint violation: duplicate phone for this clinic
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'DUPLICATE_PHONE', message: 'A customer with this phone number already exists' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
