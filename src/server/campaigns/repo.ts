/**
 * Campaign repository — pure data-layer functions, no HTTP knowledge.
 *
 * Variant used:
 *  - createClient (scoped): for vet-facing reads (list, get)
 *  - createAdminClient: for send flows that need to update clinics usage counter
 *    atomically alongside recipient inserts.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type Campaign = {
  id: string
  clinic_id: string
  segment_id: string | null
  name: string
  template_name: string
  template_id: string | null
  kapso_broadcast_id: string | null
  status: 'draft' | 'sending' | 'completed' | 'failed'
  pilot: boolean
  pilot_cap: number
  total_recipients: number
  sent_count: number
  delivered_count: number
  read_count: number
  responded_count: number
  failed_count: number
  scheduled_at: string | null
  sent_at: string | null
  created_at: string
}

export type CampaignWithSegment = Campaign & {
  segment: { id: string; name: string } | null
}

export type CreateCampaignInput = {
  clinic_id: string
  segment_id: string | null
  name: string
  template_name: string
  template_id?: string
  pilot?: boolean
}

/** List all campaigns for the authenticated user's clinic, newest first. */
export async function listCampaigns(): Promise<CampaignWithSegment[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('campaigns')
    .select('*, segment:segments(id, name)')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as CampaignWithSegment[]
}

/** Get a single campaign with its segment. */
export async function getCampaign(id: string): Promise<CampaignWithSegment | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('campaigns')
    .select('*, segment:segments(id, name)')
    .eq('id', id)
    .single()

  if (error) return null
  return data as CampaignWithSegment
}

/** Create a draft campaign. */
export async function createCampaign(input: CreateCampaignInput): Promise<Campaign> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      clinic_id: input.clinic_id,
      segment_id: input.segment_id,
      name: input.name,
      template_name: input.template_name,
      template_id: input.template_id ?? null,
      pilot: input.pilot ?? true, // Default ON per design §5.2
      status: 'draft',
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as Campaign
}

/** Update campaign status + kapso_broadcast_id after hydration. */
export async function updateCampaignAfterHydrate(
  id: string,
  { totalRecipients, kapsoBroadcastId }: { totalRecipients: number; kapsoBroadcastId: string },
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('campaigns')
    .update({
      total_recipients: totalRecipients,
      kapso_broadcast_id: kapsoBroadcastId,
      status: 'sending',
      sent_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

/** Mark campaign as failed. */
export async function markCampaignFailed(id: string, reason?: string): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('campaigns')
    .update({ status: 'failed' })
    .eq('id', id)
}

/** Increment clinic's messages_used_this_month counter. */
export async function incrementClinicUsage(
  clinicId: string,
  count: number,
): Promise<void> {
  const admin = createAdminClient()
  // Use RPC for atomic increment
  const { error } = await admin.rpc('increment_messages_used', {
    p_clinic_id: clinicId,
    p_count: count,
  })
  if (error) {
    // Fallback: read + write (less safe but functional)
    const { data: clinic } = await admin
      .from('clinics')
      .select('messages_used_this_month')
      .eq('id', clinicId)
      .single()
    if (clinic) {
      await admin
        .from('clinics')
        .update({ messages_used_this_month: clinic.messages_used_this_month + count })
        .eq('id', clinicId)
    }
  }
}

/** Get clinic with monthly cap data. */
export async function getClinicCapData(clinicId: string): Promise<{
  monthly_message_limit: number
  messages_used_this_month: number
  first_full_send_at: string | null
} | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('clinics')
    .select('monthly_message_limit, messages_used_this_month, first_full_send_at')
    .eq('id', clinicId)
    .single()

  if (error) return null
  return data
}

/** Mark first_full_send_at if this is the first non-pilot send. */
export async function markFirstFullSend(clinicId: string): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('clinics')
    .update({ first_full_send_at: new Date().toISOString() })
    .eq('id', clinicId)
    .is('first_full_send_at', null)
}
