/**
 * Pet repository — pure data-layer functions, no HTTP knowledge.
 *
 * Agent-tool callers (upsert_pet) use the service-role client (bypasses RLS).
 * Vet-facing UI routes use the scoped client (RLS-enforced).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const VALID_SPECIES = ['perro', 'gato', 'ave', 'conejo', 'otro'] as const
export type Species = (typeof VALID_SPECIES)[number]

export type PetInput = {
  clinic_id: string
  customer_id: string
  name: string
  species: Species
  breed?: string | null
  birth_date?: string | null
  weight_kg?: number | null
  last_visit_date?: string | null
  next_vaccine_due?: string | null
  health_notes?: string | null
}

export type PetUpsertInput = {
  clinic_id: string
  customer_id: string
  name: string
  species: Species
  breed?: string | null
  birth_date?: string | null
  weight_kg?: number | null
  next_vaccine_due?: string | null
  health_notes?: string | null
}

/** List all pets for a given customer (scoped via RLS). */
export async function listPetsForCustomer(customer_id: string) {
  const supabase = await createClient()
  return supabase
    .from('pets')
    .select('*')
    .eq('customer_id', customer_id)
    .order('created_at', { ascending: true })
}

/** Create a pet record (scoped via RLS — clinic_id enforced by RLS policies). */
export async function createPet(input: PetInput) {
  const supabase = await createClient()
  return supabase
    .from('pets')
    .insert({
      ...input,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()
}

/**
 * Upsert a pet keyed on (customer_id, name).
 * If a pet with the same customer_id + name exists → update.
 * Otherwise → insert as new.
 *
 * Uses service-role client — called from the HMAC-authenticated agent tool route.
 * Returns { pet_id: string, action: 'created' | 'updated' }
 */
export async function upsertPet(
  input: PetUpsertInput,
): Promise<{ pet_id: string; action: 'created' | 'updated' }> {
  const admin = createAdminClient()

  // Check if pet with same customer_id + name already exists
  const { data: existing } = await admin
    .from('pets')
    .select('id')
    .eq('customer_id', input.customer_id)
    .eq('name', input.name)
    .maybeSingle()

  if (existing) {
    // Update existing pet
    const updateFields: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (input.species) updateFields.species = input.species
    if (input.breed !== undefined) updateFields.breed = input.breed
    if (input.birth_date !== undefined) updateFields.birth_date = input.birth_date
    if (input.weight_kg !== undefined) updateFields.weight_kg = input.weight_kg
    if (input.next_vaccine_due !== undefined) updateFields.next_vaccine_due = input.next_vaccine_due
    if (input.health_notes !== undefined) updateFields.health_notes = input.health_notes

    await admin.from('pets').update(updateFields).eq('id', existing.id)
    return { pet_id: existing.id, action: 'updated' }
  }

  // Insert new pet
  const { data: created, error } = await admin
    .from('pets')
    .insert({
      clinic_id: input.clinic_id,
      customer_id: input.customer_id,
      name: input.name,
      species: input.species,
      breed: input.breed ?? null,
      birth_date: input.birth_date ?? null,
      weight_kg: input.weight_kg ?? null,
      next_vaccine_due: input.next_vaccine_due ?? null,
      health_notes: input.health_notes ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error || !created) {
    throw new Error(`Failed to create pet: ${error?.message ?? 'unknown error'}`)
  }

  return { pet_id: created.id, action: 'created' }
}
