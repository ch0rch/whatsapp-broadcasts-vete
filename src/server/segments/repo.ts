/**
 * Segment repository — pure data-layer functions, no HTTP knowledge.
 * Uses the RLS-scoped createClient for vet-UI paths.
 */

import { createClient } from '@/lib/supabase/server'
import type { CreateSegmentInput, Segment, SegmentDefinition } from './types'

/** List all segments for the authenticated user's clinic. */
export async function listSegments(): Promise<Segment[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('segments')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as Segment[]
}

/** Get a single segment by id (scoped via RLS). */
export async function getSegment(id: string): Promise<Segment | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('segments')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return data as Segment
}

/** Create a segment. clinic_id is required; RLS enforces ownership. */
export async function createSegment(input: CreateSegmentInput): Promise<Segment> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('segments')
    .insert({
      clinic_id: input.clinic_id,
      name: input.name,
      definition: input.definition,
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as Segment
}

/** Delete a segment (hard delete — no cascade risk; campaigns keep segment_id nullable). */
export async function deleteSegment(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('segments').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Validate a SegmentDefinition shape (basic). Returns null or error message. */
export function validateDefinition(definition: SegmentDefinition): string | null {
  if (!definition || typeof definition !== 'object') return 'Definition is required'
  if (definition.combinator !== 'and' && definition.combinator !== 'or') {
    return 'combinator must be "and" or "or"'
  }
  if (!Array.isArray(definition.rules)) return 'rules must be an array'
  if (definition.rules.length === 0) return 'At least one rule is required'
  return null
}
