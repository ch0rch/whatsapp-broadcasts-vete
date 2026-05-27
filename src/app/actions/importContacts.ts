'use server'

/**
 * Server action: importContacts
 *
 * Accepts a list of parsed rows (phone + optional name + optional pet fields from CSV column
 * mapping), normalizes Argentine phone numbers to E.164, bulk-inserts unique customer records,
 * and — when both pet_name AND species are present — upserts the pet linked to that customer.
 *
 * Returns:
 *   {
 *     customers_imported: number,
 *     customers_skipped_duplicate: number,
 *     pets_imported: number,
 *     rows_skipped_invalid: number,
 *     errors: string[]
 *   }
 *
 * Idempotent: re-importing the same CSV → all customers are duplicates, pets are upserted
 * (keyed on customer_id + name, so no duplicate pet rows are created).
 */

import { createClient } from '@/lib/supabase/server'
import { normalizeAndValidate } from '@/lib/phone-normalizer'
import { bulkCreateCustomers, lookupByPhone } from '@/server/customers/repo'
import { upsertPet, VALID_SPECIES } from '@/server/pets/repo'
import type { Species } from '@/server/pets/repo'

export type ImportRow = {
  raw_phone: string
  name?: string
  // Pet fields — a pet is created only when BOTH pet_name AND species are present
  pet_name?: string
  species?: string
  breed?: string
  birth_date?: string   // ISO 8601 YYYY-MM-DD; invalid values are stored as null (not a row error)
  weight_kg?: string    // numeric string from CSV; invalid → null
  pet_notes?: string
}

export type ImportResult = {
  customers_imported: number
  customers_skipped_duplicate: number
  pets_imported: number
  rows_skipped_invalid: number
  errors: string[]
}

/** Parse a birth_date string to ISO date string or null. Never throws. */
function parseBirthDate(raw: string | undefined): string | null {
  if (!raw?.trim()) return null
  const d = new Date(raw.trim())
  if (isNaN(d.getTime())) return null
  // Return YYYY-MM-DD
  return d.toISOString().slice(0, 10)
}

/** Parse a weight string to number or null. Never throws. */
function parseWeightKg(raw: string | undefined): number | null {
  if (!raw?.trim()) return null
  const n = parseFloat(raw.trim())
  if (isNaN(n) || n <= 0) return null
  return n
}

export async function importContacts(rows: ImportRow[]): Promise<ImportResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('No autenticado')
  }

  const { data: membership } = await supabase
    .from('clinic_members')
    .select('clinic_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    throw new Error('No tenés una clínica asociada')
  }

  const clinic_id = membership.clinic_id

  // ── Phase 1: validate + normalize each row ────────────────────────────────

  let rows_skipped_invalid = 0
  const errors: string[] = []

  type NormalizedRow = {
    phone_number: string
    name?: string
    pet_name?: string
    species?: Species
    breed?: string | null
    birth_date?: string | null
    weight_kg?: number | null
    pet_notes?: string | null
  }

  const validRows: NormalizedRow[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowLabel = `Fila ${i + 2}` // +2: 1-based + header offset

    const normalized = normalizeAndValidate(row.raw_phone)
    if (!normalized) {
      rows_skipped_invalid++
      errors.push(`${rowLabel}: teléfono inválido "${row.raw_phone}"`)
      continue
    }

    // Validate species when provided — invalid species → skip the whole row
    let species: Species | undefined
    if (row.species?.trim()) {
      const speciesValue = row.species.trim().toLowerCase()
      if (!VALID_SPECIES.includes(speciesValue as Species)) {
        rows_skipped_invalid++
        errors.push(
          `${rowLabel}: especie inválida "${row.species}" — valores aceptados: ${VALID_SPECIES.join(', ')}`,
        )
        continue
      }
      species = speciesValue as Species
    }

    validRows.push({
      phone_number: normalized,
      name: row.name,
      // Pet is only created when BOTH pet_name AND species are present
      pet_name: row.pet_name?.trim() || undefined,
      species,
      breed: row.breed?.trim() || null,
      birth_date: parseBirthDate(row.birth_date),
      weight_kg: parseWeightKg(row.weight_kg),
      pet_notes: row.pet_notes?.trim() || null,
    })
  }

  // ── Phase 2: bulk-create customers ───────────────────────────────────────

  const customerRows = validRows.map((r) => ({ phone_number: r.phone_number, name: r.name }))

  const {
    created: customers_imported,
    skipped_duplicates: customers_skipped_duplicate,
    skipped_invalid: dbInvalid,
    errors: customerErrors,
  } = await bulkCreateCustomers(clinic_id, customerRows)

  rows_skipped_invalid += dbInvalid
  errors.push(...customerErrors)

  // ── Phase 3: upsert pets for rows that have both pet_name + species ───────

  let pets_imported = 0
  const petRows = validRows.filter((r) => r.pet_name && r.species)

  for (const petRow of petRows) {
    try {
      // Resolve the customer_id — required for the pet upsert key
      const customer = await lookupByPhone(clinic_id, petRow.phone_number)
      if (!customer) {
        // Should not happen (customer was just created or already existed), but guard anyway
        errors.push(`Mascota omitida: cliente con teléfono ${petRow.phone_number} no encontrado`)
        continue
      }

      await upsertPet({
        clinic_id,
        customer_id: customer.id,
        name: petRow.pet_name!,
        species: petRow.species!,
        breed: petRow.breed,
        birth_date: petRow.birth_date,
        weight_kg: petRow.weight_kg,
        health_notes: petRow.pet_notes,
      })

      pets_imported++
    } catch (err) {
      errors.push(
        `Mascota de ${petRow.phone_number}: ${err instanceof Error ? err.message : 'error desconocido'}`,
      )
    }
  }

  return {
    customers_imported,
    customers_skipped_duplicate,
    pets_imported,
    rows_skipped_invalid,
    errors,
  }
}
