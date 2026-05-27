/**
 * hydrateRecipients — Flow A step 2–6.
 *
 * 1. Resolve matching customers from segment (opted-out excluded = L2).
 * 2. Monthly cap check.
 * 3. Pilot LIMIT 100 (shuffle when pilot=true).
 * 4. Force-first-pilot check.
 * 5. INSERT campaign_recipients rows.
 * 6. kapsoApi.createBroadcast → store kapso_broadcast_id.
 * 7. kapsoApi.addRecipients in batches of 500.
 * 8. Return hydration result for caller to sendBroadcast + update counter.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { kapsoApi } from '@/lib/kapso-api'
import { matchCustomers } from '@/server/segments/builder'
import {
  getClinicCapData,
  updateCampaignAfterHydrate,
  markCampaignFailed,
} from './repo'
import type { Campaign } from './repo'

export type HydrateError =
  | { code: 'monthly_cap_reached'; limit: number; used: number }
  | { code: 'no_recipients' }
  | { code: 'no_segment' }
  | { code: 'force_pilot_required' }
  | { code: 'internal_error'; message: string }

export type HydrateResult =
  | { ok: true; totalRecipients: number; kapsoBroadcastId: string }
  | { ok: false; error: HydrateError }

const RECIPIENT_BATCH_SIZE = 500
const PILOT_CAP = 100

export async function hydrateRecipients(
  campaign: Campaign,
  phoneNumberId: string,
): Promise<HydrateResult> {
  const admin = createAdminClient()

  // 1. Resolve segment
  if (!campaign.segment_id) {
    return { ok: false, error: { code: 'no_segment' } }
  }

  // getSegment uses scoped client — need admin for service flows
  const { data: segmentRow, error: segErr } = await admin
    .from('segments')
    .select('*')
    .eq('id', campaign.segment_id)
    .single()

  if (segErr || !segmentRow) {
    return { ok: false, error: { code: 'no_segment' } }
  }

  // Build customer list — matchCustomers already excludes opted-out (L2)
  let customers = await matchCustomers(admin, campaign.clinic_id, segmentRow.definition)

  if (customers.length === 0) {
    return { ok: false, error: { code: 'no_recipients' } }
  }

  // 2. Monthly cap check
  const capData = await getClinicCapData(campaign.clinic_id)
  if (!capData) {
    return { ok: false, error: { code: 'internal_error', message: 'Could not fetch clinic data' } }
  }

  const { monthly_message_limit, messages_used_this_month, first_full_send_at } = capData
  // 3. Pilot cap
  if (campaign.pilot) {
    // Shuffle + limit 100
    customers = shuffle(customers).slice(0, PILOT_CAP)
  } else {
    // 4. Force-first-pilot: if clinic has never done a full send, reject
    if (!first_full_send_at) {
      return { ok: false, error: { code: 'force_pilot_required' } }
    }
  }

  // Re-check cap after pilot limit
  const effectiveCount = customers.length
  if (messages_used_this_month + effectiveCount > monthly_message_limit) {
    return {
      ok: false,
      error: {
        code: 'monthly_cap_reached',
        limit: monthly_message_limit,
        used: messages_used_this_month,
      },
    }
  }

  try {
    // 5. INSERT campaign_recipients (active ones)
    const recipientRows = customers.map((c) => ({
      clinic_id: campaign.clinic_id,
      campaign_id: campaign.id,
      customer_id: c.id,
      phone_number: c.phone_number,
      status: 'pending' as const,
      created_at: new Date().toISOString(),
    }))

    // Also insert excluded (opted-out) audit rows
    // Already excluded at matchCustomers level — get excluded count for audit
    const allCustomersResult = await admin
      .from('customers')
      .select('id, phone_number')
      .eq('clinic_id', campaign.clinic_id)
      .is('deleted_at', null)
      .not('opted_out_at', 'is', null)

    const excludedRows = (allCustomersResult.data ?? []).map((c) => ({
      clinic_id: campaign.clinic_id,
      campaign_id: campaign.id,
      customer_id: c.id,
      phone_number: c.phone_number,
      status: 'excluded' as const,
      excluded_reason: 'opted_out_excluded',
      created_at: new Date().toISOString(),
    }))

    // Batch insert recipients
    if (recipientRows.length > 0) {
      const { error: insertErr } = await admin
        .from('campaign_recipients')
        .insert(recipientRows)
      if (insertErr) throw new Error(insertErr.message)
    }

    if (excludedRows.length > 0) {
      // Insert excluded in chunks to avoid hitting insert limits
      for (let i = 0; i < excludedRows.length; i += 1000) {
        await admin.from('campaign_recipients').insert(excludedRows.slice(i, i + 1000))
      }
    }

    // 6. kapsoApi.createBroadcast
    const broadcastRes = await kapsoApi.broadcasts.create({
      whatsapp_broadcast: {
        name: campaign.name,
        phone_number_id: phoneNumberId,
        whatsapp_template_id: campaign.template_id ?? campaign.template_name,
      },
    })
    const kapsoBroadcastId = broadcastRes.data.id

    // 7. kapsoApi.addRecipients in batches of 500
    for (let i = 0; i < customers.length; i += RECIPIENT_BATCH_SIZE) {
      const batch = customers.slice(i, i + RECIPIENT_BATCH_SIZE)
      await kapsoApi.broadcasts.addRecipients(kapsoBroadcastId, {
        whatsapp_broadcast: {
          recipients: batch.map((c) => ({ phone_number: c.phone_number })),
        },
      })
    }

    // Update campaign record
    await updateCampaignAfterHydrate(campaign.id, {
      totalRecipients: effectiveCount,
      kapsoBroadcastId,
    })

    return { ok: true, totalRecipients: effectiveCount, kapsoBroadcastId }
  } catch (err) {
    await markCampaignFailed(campaign.id)
    return {
      ok: false,
      error: {
        code: 'internal_error',
        message: err instanceof Error ? err.message : 'Unknown error',
      },
    }
  }
}

/** Fisher-Yates shuffle (for pilot random sampling). */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
