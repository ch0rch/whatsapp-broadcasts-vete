/**
 * Conversation + message repository — pure data-layer functions.
 *
 * All functions receive an admin Supabase client (service role) because:
 * - Webhook routes bypass user JWT auth.
 * - These functions must resolve clinic ownership in app code, not RLS.
 *
 * The admin client bypasses RLS; clinic_id scoping is enforced explicitly
 * via `.eq('clinic_id', ...)` on every query.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ───────────────────────────────────────────────────────────────────

export type ConversationStatus = 'active' | 'handoff' | 'ended'

export type Conversation = {
  id: string
  clinic_id: string
  customer_id: string | null
  kapso_conversation_id: string | null
  phone_number: string
  status: ConversationStatus
  campaign_id: string | null
  ai_summary: string | null
  created_at: string
  ended_at: string | null
}

export type MessageDirection = 'inbound' | 'outbound'

export type Message = {
  id: string
  clinic_id: string
  conversation_id: string
  kapso_message_id: string | null
  direction: MessageDirection
  type: string
  content: string | null
  campaign_id: string | null
  timestamp: string
  created_at: string
}

export type FindOrCreateConversationInput = {
  clinic_id: string
  kapso_conversation_id: string
  phone_number: string
  customer_id?: string
  campaign_id?: string
}

export type UpsertMessageInput = {
  clinic_id: string
  conversation_id: string
  kapso_message_id: string
  direction: MessageDirection
  type?: string
  content?: string
  campaign_id?: string
  timestamp: string
}

// ─── Conversation functions ───────────────────────────────────────────────────

/**
 * Find an existing conversation by kapso_conversation_id, or create one.
 *
 * Idempotent: safe to call multiple times for the same Kapso conversation —
 * the UNIQUE constraint on kapso_conversation_id prevents duplicates.
 *
 * If the conversation already exists but lacks customer_id and one is provided,
 * the record is updated in-place.
 */
export async function findOrCreateConversation(
  admin: SupabaseClient,
  input: FindOrCreateConversationInput,
): Promise<Conversation> {
  const { clinic_id, kapso_conversation_id, phone_number, customer_id, campaign_id } = input

  // Try INSERT first (upsert pattern)
  const { data: inserted, error: insertErr } = await admin
    .from('conversations')
    .insert({
      clinic_id,
      kapso_conversation_id,
      phone_number,
      customer_id: customer_id ?? null,
      campaign_id: campaign_id ?? null,
      status: 'active',
    })
    .select()
    .single()

  if (!insertErr && inserted) {
    return inserted as Conversation
  }

  // Conflict (already exists) — fetch and optionally update customer_id
  const { data: existing, error: fetchErr } = await admin
    .from('conversations')
    .select('*')
    .eq('kapso_conversation_id', kapso_conversation_id)
    .single()

  if (fetchErr || !existing) {
    throw new Error(`findOrCreateConversation: could not fetch existing conversation — ${fetchErr?.message}`)
  }

  // Patch customer_id if it was missing and we have one now
  if (!existing.customer_id && customer_id) {
    const { data: updated } = await admin
      .from('conversations')
      .update({ customer_id })
      .eq('id', existing.id)
      .select()
      .single()
    return (updated ?? existing) as Conversation
  }

  return existing as Conversation
}

/**
 * Upsert a message row keyed on kapso_message_id.
 *
 * Idempotent: duplicate webhook deliveries for the same kapso_message_id
 * are silently ignored (ON CONFLICT DO NOTHING via ignoreDuplicates).
 * Returns the existing row on conflict.
 */
export async function upsertMessage(
  admin: SupabaseClient,
  input: UpsertMessageInput,
): Promise<Message | null> {
  const {
    clinic_id,
    conversation_id,
    kapso_message_id,
    direction,
    type = 'text',
    content,
    campaign_id,
    timestamp,
  } = input

  const { data, error } = await admin
    .from('messages')
    .upsert(
      {
        clinic_id,
        conversation_id,
        kapso_message_id,
        direction,
        type,
        content: content ?? null,
        campaign_id: campaign_id ?? null,
        timestamp,
      },
      {
        onConflict: 'kapso_message_id',
        ignoreDuplicates: true,
      },
    )
    .select()
    .single()

  if (error && error.code !== '23505') {
    // 23505 = unique_violation — expected on duplicate, not an error
    console.error('[conversations/repo] upsertMessage error', { error, kapso_message_id })
    return null
  }

  return data as Message | null
}

/**
 * Update the status of a conversation.
 * Used by the project webhook for handoff and completion events.
 */
export async function setConversationStatus(
  admin: SupabaseClient,
  conversationId: string,
  status: ConversationStatus,
  aiSummary?: string,
): Promise<void> {
  const update: Record<string, unknown> = { status }
  if (aiSummary !== undefined) update.ai_summary = aiSummary
  if (status === 'ended') update.ended_at = new Date().toISOString()

  const { error } = await admin
    .from('conversations')
    .update(update)
    .eq('id', conversationId)

  if (error) {
    console.error('[conversations/repo] setConversationStatus error', { error, conversationId })
  }
}

/**
 * Find a conversation by kapso_conversation_id.
 * Returns null if not found.
 */
export async function getConversationByKapsoId(
  admin: SupabaseClient,
  kapsoConversationId: string,
): Promise<Conversation | null> {
  const { data, error } = await admin
    .from('conversations')
    .select('*')
    .eq('kapso_conversation_id', kapsoConversationId)
    .single()

  if (error) return null
  return data as Conversation
}

/**
 * List conversations in 'handoff' status for a clinic.
 * Used by the inbox UI (PR-5/WU12). Joins customers to surface their name.
 */
export type HandoffConversation = Conversation & {
  customer_name: string | null
}

export async function listHandoffConversations(
  admin: SupabaseClient,
  clinicId: string,
): Promise<HandoffConversation[]> {
  const { data, error } = await admin
    .from('conversations')
    .select('*, customer:customers(name)')
    .eq('clinic_id', clinicId)
    .eq('status', 'handoff')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[conversations/repo] listHandoffConversations error', { error, clinicId })
    return []
  }

  return ((data ?? []) as Array<Conversation & { customer: { name: string | null } | null }>).map(
    (row) => ({
      ...row,
      customer_name: row.customer?.name ?? null,
    }),
  )
}

/**
 * Get a single conversation by id, scoped to clinic.
 * Returns null if not found or if it belongs to a different clinic.
 */
export async function getConversation(
  admin: SupabaseClient,
  clinicId: string,
  conversationId: string,
): Promise<Conversation | null> {
  const { data, error } = await admin
    .from('conversations')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('id', conversationId)
    .single()

  if (error) return null
  return data as Conversation
}
