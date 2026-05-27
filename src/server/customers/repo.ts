/**
 * Customer repository — pure data-layer functions, no HTTP knowledge.
 *
 * Two client variants:
 * - scopedClient (createClient): respects RLS — used for vet-facing routes
 * - adminClient (createAdminClient): bypasses RLS — used ONLY for agent-tool routes
 *   that authenticate via HMAC and resolve clinic_id themselves
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type Customer = {
  id: string
  clinic_id: string
  phone_number: string
  name: string | null
  email: string | null
  notes: string | null
  opted_out_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type CustomerWithPets = Customer & {
  pets: Pet[]
}

export type Pet = {
  id: string
  clinic_id: string
  customer_id: string
  name: string
  species: string
  breed: string | null
  birth_date: string | null
  weight_kg: number | null
  last_visit_date: string | null
  next_vaccine_due: string | null
  health_notes: string | null
  created_at: string
  updated_at: string
}

export type ListCustomersOptions = {
  q?: string
  page?: number
  pageSize?: number
}

export type CreateCustomerInput = {
  clinic_id: string
  phone_number: string
  name?: string
  email?: string
  notes?: string
}

export type UpdateCustomerInput = Partial<Pick<Customer, 'name' | 'email' | 'notes'>>

// ─── Scoped-client operations (RLS-enforced, vet UI paths) ───────────────────

/**
 * List non-deleted customers for the authenticated user's clinic.
 * Supports fuzzy search by name or phone_number.
 */
export async function listCustomers(options: ListCustomersOptions = {}) {
  const supabase = await createClient()
  const { q, page = 1, pageSize = 50 } = options
  const offset = (page - 1) * pageSize

  let query = supabase
    .from('customers')
    .select('*', { count: 'exact' })
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (q) {
    // Case-insensitive partial match on name or phone_number
    query = query.or(`name.ilike.%${q}%,phone_number.ilike.%${q}%`)
  }

  return query
}

/** Get a single non-deleted customer by id (scoped to authenticated clinic via RLS). */
export async function getCustomer(id: string) {
  const supabase = await createClient()
  return supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()
}

/** Create a customer. clinic_id must be provided (RLS also enforces ownership). */
export async function createCustomer(input: CreateCustomerInput) {
  const supabase = await createClient()
  return supabase
    .from('customers')
    .insert({
      ...input,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()
}

/** Update mutable fields on a customer (scoped via RLS). */
export async function updateCustomer(id: string, input: UpdateCustomerInput) {
  const supabase = await createClient()
  return supabase
    .from('customers')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()
}

/** Soft-delete a customer by setting deleted_at = now(). */
export async function softDeleteCustomer(id: string) {
  const supabase = await createClient()
  return supabase
    .from('customers')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()
}

// ─── Admin-client operations (service-role, HMAC-authenticated agent tools) ──

/**
 * Look up a customer by phone_number within a clinic.
 * Returns the customer with their pets, or null if not found / deleted.
 * Used by the Kapso agent tool: lookup_customer.
 */
export async function lookupByPhone(
  clinic_id: string,
  phone_number: string,
): Promise<CustomerWithPets | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('customers')
    .select(`
      *,
      pets (
        id,
        name,
        species,
        breed,
        birth_date,
        next_vaccine_due,
        weight_kg,
        health_notes
      )
    `)
    .eq('clinic_id', clinic_id)
    .eq('phone_number', phone_number)
    .is('deleted_at', null)
    .single()

  if (error || !data) return null
  return data as CustomerWithPets
}

/**
 * Check if a phone_number already exists for this clinic (used for duplicate detection
 * before insert, and in CSV import).
 * Uses service-role client for bulk import flows.
 */
export async function phoneExistsForClinic(
  admin: SupabaseClient,
  clinic_id: string,
  phone_number: string,
): Promise<boolean> {
  const { data } = await admin
    .from('customers')
    .select('id')
    .eq('clinic_id', clinic_id)
    .eq('phone_number', phone_number)
    .is('deleted_at', null)
    .maybeSingle()

  return !!data
}

/**
 * Bulk-create customers (for CSV import). Uses the admin client for performance.
 * Returns { created: string[], errors: string[] }.
 */
export async function bulkCreateCustomers(
  clinic_id: string,
  rows: Array<{ phone_number: string; name?: string }>,
): Promise<{ created: number; skipped_duplicates: number; skipped_invalid: number; errors: string[] }> {
  const admin = createAdminClient()
  let created = 0
  let skipped_duplicates = 0
  let skipped_invalid = 0
  const errors: string[] = []

  for (const row of rows) {
    if (!row.phone_number) {
      skipped_invalid++
      continue
    }

    const exists = await phoneExistsForClinic(admin, clinic_id, row.phone_number)
    if (exists) {
      skipped_duplicates++
      continue
    }

    const { error } = await admin.from('customers').insert({
      clinic_id,
      phone_number: row.phone_number,
      name: row.name ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    if (error) {
      // Unique constraint violation (race condition) → treat as duplicate
      if (error.code === '23505') {
        skipped_duplicates++
      } else {
        errors.push(`${row.phone_number}: ${error.message}`)
        skipped_invalid++
      }
    } else {
      created++
    }
  }

  return { created, skipped_duplicates, skipped_invalid, errors }
}
