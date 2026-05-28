'use server'

/**
 * Server actions for conversation management.
 * Used by the inbox UI (WU12).
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { kapsoApi } from '@/lib/kapso-api'

/**
 * Return a handoff conversation back to the AI agent.
 *
 * Steps:
 * 1. Resolve the authenticated user's clinic_id.
 * 2. Verify the conversation belongs to this clinic and is in 'handoff' status.
 * 3. UPDATE conversations SET status='active' WHERE status='handoff'.
 * 4. Attempt to resume the Kapso workflow execution (option a).
 *    If no execution_id is stored or the resume API fails, we skip silently —
 *    the next inbound message from the customer will trigger a fresh execution (option b).
 *
 * Returns { error: string } on failure, null on success.
 */
export async function returnConversationToAI(
  conversationId: string,
): Promise<{ error: string } | null> {
  if (!conversationId) {
    return { error: 'Conversation ID is required' }
  }

  // Resolve clinic_id from the authenticated user's session (RLS-enforced)
  const supabase = await createClient()
  const { data: membership } = await supabase.from('clinic_members').select('clinic_id').single()
  if (!membership) {
    return { error: 'No se encontró tu clínica.' }
  }
  const clinicId = membership.clinic_id

  // Use admin client for the update (bypasses RLS; ownership enforced by WHERE clause)
  const admin = createAdminClient()

  // Guard: only update if currently 'handoff'
  const { data: updated, error: updateError } = await admin
    .from('conversations')
    .update({ status: 'active' })
    .eq('id', conversationId)
    .eq('clinic_id', clinicId)
    .eq('status', 'handoff')
    .select('id, kapso_conversation_id')
    .single()

  if (updateError || !updated) {
    console.error('[actions/conversations] returnConversationToAI update failed', {
      error: updateError,
      conversationId,
    })
    return { error: 'No se pudo devolver la conversación al agente. Verificá que siga en espera.' }
  }

  // Attempt Kapso workflow resume (option a).
  // The conversations table stores kapso_conversation_id, not the workflow execution_id.
  // The Kapso platform API resume endpoint uses workflow_execution_id.
  // Since we don't persist execution_id in our schema (gap documented here),
  // we skip the resume call — the next inbound message will trigger a fresh execution (option b).
  //
  // To implement option (a) fully: add a kapso_execution_id column to conversations,
  // populate it from the workflow.execution.handoff webhook payload, and call:
  //   await kapsoApi.workflows.resumeExecution(execution_id)
  //
  // For now we log the gap and return success — DB state is already updated.
  console.log('[actions/conversations] returnConversationToAI: DB updated, Kapso resume skipped', {
    conversationId: updated.id,
    kapsoConversationId: updated.kapso_conversation_id,
    note: 'Next inbound message will trigger fresh workflow execution (option b)',
  })

  // Suppress unused-import warning — kapsoApi.workflows is available for future use
  void kapsoApi

  return null
}
