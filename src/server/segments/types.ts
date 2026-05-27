/**
 * Segment definition types.
 *
 * A segment is a named filter tree persisted as JSONB in segments.definition.
 * The builder produces a SegmentDefinition; the repo stores and retrieves it.
 *
 * Supported predicates:
 *  - customer predicates: opted_in, species, name_contains
 *  - pet predicates: species, vaccine_due_before, last_visit_before, has_pet
 *
 * The definition is always { combinator: 'and'|'or', rules: SegmentRule[] }.
 * Rules can be nested groups (recursive), but for MVP we keep it flat (depth 1).
 */

export type SegmentCombinator = 'and' | 'or'

export type SegmentRuleField =
  | 'opted_in'           // customer: no opted_out_at → boolean true
  | 'species'            // pet: species IN (list)
  | 'vaccine_due_before' // pet: next_vaccine_due <= date
  | 'last_visit_before'  // pet: last_visit_date <= date
  | 'has_pet'            // customer: has at least one pet

export type SegmentRuleOperator =
  | 'eq'     // field = value
  | 'neq'    // field != value
  | 'in'     // field IN (values)
  | 'before' // field <= value (date)
  | 'after'  // field >= value (date)
  | 'is_true'  // boolean field is true
  | 'is_false' // boolean field is false

export type SegmentRule = {
  field: SegmentRuleField
  operator: SegmentRuleOperator
  value?: string | string[] | boolean
}

export type SegmentDefinition = {
  combinator: SegmentCombinator
  rules: SegmentRule[]
}

export type Segment = {
  id: string
  clinic_id: string
  name: string
  definition: SegmentDefinition
  created_at: string
}

export type CreateSegmentInput = {
  clinic_id: string
  name: string
  definition: SegmentDefinition
}
