/**
 * Segment query builder.
 *
 * Translates a SegmentDefinition into a Supabase/Postgres query
 * that returns customer rows matched by the segment predicates.
 *
 * The query always JOINs customers → pets so pet-level predicates can be applied.
 * Opted-out customers are ALWAYS excluded (L2 opt-out enforcement).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { SegmentDefinition, SegmentRule } from './types'

export type CustomerMatch = {
  id: string
  phone_number: string
  name: string | null
}

/**
 * Build a preview query: returns COUNT of matching customers.
 * Uses the provided Supabase client (either scoped or admin).
 */
export async function previewSegment(
  supabase: SupabaseClient,
  clinicId: string,
  definition: SegmentDefinition,
): Promise<{ count: number; error: string | null }> {
  const ids = await matchCustomerIds(supabase, clinicId, definition)
  if ('error' in ids && ids.error) return { count: 0, error: ids.error }
  return { count: (ids as { ids: string[] }).ids.length, error: null }
}

/**
 * Return the list of matching customer { id, phone_number } for hydration.
 * Opted-out customers are excluded here (L2 enforcement).
 */
export async function matchCustomers(
  supabase: SupabaseClient,
  clinicId: string,
  definition: SegmentDefinition,
): Promise<CustomerMatch[]> {
  const result = await matchCustomerIds(supabase, clinicId, definition)
  if ('error' in result) return []
  return result.customers
}

/**
 * Like matchCustomers but includes opted-out customers in the result.
 * Used by hydrateRecipients to compute the segment-scoped excluded audit set.
 *
 * Returns the full set of customers that match the segment's predicates,
 * regardless of opt-out status. The caller can then diff against the active
 * set to find who was excluded by opt-out within this segment.
 */
export async function matchCustomersIncludingOptedOut(
  supabase: SupabaseClient,
  clinicId: string,
  definition: SegmentDefinition,
): Promise<CustomerMatch[]> {
  const result = await matchCustomerIdsIncludingOptedOut(supabase, clinicId, definition)
  if ('error' in result) return []
  return result.customers
}

// ─── internal ────────────────────────────────────────────────────────────────

/**
 * Variant of matchCustomerIds that does NOT filter opted_out_at.
 * Used to compute the segment-scoped excluded set for audit rows.
 */
async function matchCustomerIdsIncludingOptedOut(
  supabase: SupabaseClient,
  clinicId: string,
  definition: SegmentDefinition,
): Promise<{ ids: string[]; customers: CustomerMatch[] } | { error: string }> {
  const { rules, combinator } = definition

  const { data: customers, error: custErr } = await supabase
    .from('customers')
    .select('id, phone_number, name, opted_out_at')
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
  // NOTE: no .is('opted_out_at', null) filter here

  if (custErr) return { error: custErr.message }
  if (!customers?.length) return { ids: [], customers: [] }

  const { data: pets, error: petErr } = await supabase
    .from('pets')
    .select('id, customer_id, species, next_vaccine_due, last_visit_date, birth_date')
    .eq('clinic_id', clinicId)

  if (petErr) return { error: petErr.message }
  const petsByCustomer = groupPetsByCustomer(pets ?? [])

  const matched = customers.filter((customer) => {
    const customerPets = petsByCustomer[customer.id] ?? []
    const results = rules.map((rule) => evaluateRule(rule, customer, customerPets))
    return combinator === 'and'
      ? results.every(Boolean)
      : results.some(Boolean)
  })

  return {
    ids: matched.map((c) => c.id),
    customers: matched.map((c) => ({
      id: c.id,
      phone_number: c.phone_number,
      name: c.name,
    })),
  }
}

async function matchCustomerIds(
  supabase: SupabaseClient,
  clinicId: string,
  definition: SegmentDefinition,
): Promise<{ ids: string[]; customers: CustomerMatch[] } | { error: string }> {
  const { rules, combinator } = definition

  // Start with all active (non-deleted, non-opted-out) customers in the clinic
  // We fetch all and apply pet-based rules in memory for MVP simplicity.
  // For >10k customers revisit with raw SQL.
  const { data: customers, error: custErr } = await supabase
    .from('customers')
    .select('id, phone_number, name')
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .is('opted_out_at', null) // L2 opt-out enforcement

  if (custErr) return { error: custErr.message }
  if (!customers?.length) return { ids: [], customers: [] }

  // Fetch all pets for this clinic (used for pet-based predicates)
  const { data: pets, error: petErr } = await supabase
    .from('pets')
    .select('id, customer_id, species, next_vaccine_due, last_visit_date, birth_date')
    .eq('clinic_id', clinicId)

  if (petErr) return { error: petErr.message }
  const petsByCustomer = groupPetsByCustomer(pets ?? [])

  // Apply rules
  const matched = customers.filter((customer) => {
    const customerPets = petsByCustomer[customer.id] ?? []
    const results = rules.map((rule) => evaluateRule(rule, customer, customerPets))
    return combinator === 'and'
      ? results.every(Boolean)
      : results.some(Boolean)
  })

  return {
    ids: matched.map((c) => c.id),
    customers: matched.map((c) => ({
      id: c.id,
      phone_number: c.phone_number,
      name: c.name,
    })),
  }
}

type PetRow = {
  id: string
  customer_id: string
  species: string
  next_vaccine_due: string | null
  last_visit_date: string | null
  birth_date: string | null
}

function groupPetsByCustomer(pets: PetRow[]): Record<string, PetRow[]> {
  return pets.reduce<Record<string, PetRow[]>>((acc, pet) => {
    if (!acc[pet.customer_id]) acc[pet.customer_id] = []
    acc[pet.customer_id].push(pet)
    return acc
  }, {})
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function evaluateRule(rule: SegmentRule, customer: any, pets: PetRow[]): boolean {
  const { field, operator, value } = rule

  switch (field) {
    case 'opted_in':
      // opted_out_at is already filtered at query level — always true here
      return operator === 'is_true' ? true : false

    case 'has_pet':
      return operator === 'is_true' ? pets.length > 0 : pets.length === 0

    case 'species': {
      const species = Array.isArray(value) ? value : [value as string]
      return pets.some((p) => species.includes(p.species))
    }

    case 'vaccine_due_before': {
      if (!value || typeof value !== 'string') return false
      const cutoff = new Date(value)
      return pets.some(
        (p) => p.next_vaccine_due != null && new Date(p.next_vaccine_due) <= cutoff,
      )
    }

    case 'last_visit_before': {
      if (!value || typeof value !== 'string') return false
      const cutoff = new Date(value)
      return pets.some(
        (p) => p.last_visit_date != null && new Date(p.last_visit_date) <= cutoff,
      )
    }

    default:
      return false
  }
}
