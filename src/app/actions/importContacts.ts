'use server'

/**
 * Server action: importContacts
 *
 * Accepts a list of parsed rows (phone_number + optional name from the CSV column mapping),
 * normalizes Argentine phone numbers to E.164, and bulk-inserts unique records.
 *
 * Returns: { imported: number, skipped_duplicates: number, skipped_invalid: number, errors: string[] }
 *
 * Idempotent: re-importing the same CSV produces skipped_duplicates for all previously-imported rows.
 */

import { createClient } from '@/lib/supabase/server'
import { normalizeAndValidate } from '@/lib/phone-normalizer'
import { bulkCreateCustomers } from '@/server/customers/repo'

export type ImportRow = {
  raw_phone: string
  name?: string
}

export type ImportResult = {
  imported: number
  skipped_duplicates: number
  skipped_invalid: number
  errors: string[]
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

  let skipped_invalid = 0
  const normalizedRows: Array<{ phone_number: string; name?: string }> = []

  for (const row of rows) {
    const normalized = normalizeAndValidate(row.raw_phone)
    if (!normalized) {
      skipped_invalid++
      continue
    }
    normalizedRows.push({ phone_number: normalized, name: row.name })
  }

  const { created, skipped_duplicates, skipped_invalid: dbInvalid, errors } =
    await bulkCreateCustomers(membership.clinic_id, normalizedRows)

  return {
    imported: created,
    skipped_duplicates,
    skipped_invalid: skipped_invalid + dbInvalid,
    errors,
  }
}
