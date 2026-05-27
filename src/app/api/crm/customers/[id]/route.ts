/**
 * GET    /api/crm/customers/[id]  — get customer by id
 * PATCH  /api/crm/customers/[id]  — update customer fields
 * DELETE /api/crm/customers/[id]  — soft-delete (sets deleted_at = now())
 *
 * Auth: Supabase JWT + RLS scoping.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCustomer, updateCustomer, softDeleteCustomer } from '@/server/customers/repo'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { data, error } = await getCustomer(id)

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await request.json()

  // Only allow updating these fields
  const { name, email, notes } = body
  const input: Record<string, string | null> = {}
  if (name !== undefined) input.name = name
  if (email !== undefined) input.email = email
  if (notes !== undefined) input.notes = notes

  if (Object.keys(input).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 })
  }

  const { data, error } = await updateCustomer(id, input)

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { data, error } = await softDeleteCustomer(id)

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
