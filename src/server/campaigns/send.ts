/**
 * sendCampaign — Flow A step 7–8.
 *
 * 1. Cap check (re-checked; hydrateRecipients also checked but send may be delayed).
 * 2. kapsoApi.sendBroadcast.
 * 3. UPDATE clinics.messages_used_this_month += sent_count.
 * 4. Mark first_full_send_at if first non-pilot send.
 */

import { kapsoApi } from '@/lib/kapso-api'
import { incrementClinicUsage, markFirstFullSend, getClinicCapData } from './repo'
import type { Campaign } from './repo'

export type SendError =
  | { code: 'monthly_cap_reached'; limit: number; used: number }
  | { code: 'no_broadcast_id' }
  | { code: 'internal_error'; message: string }

export type SendResult =
  | { ok: true; sentCount: number }
  | { ok: false; error: SendError }

export async function sendCampaign(
  campaign: Campaign,
): Promise<SendResult> {
  if (!campaign.kapso_broadcast_id) {
    return { ok: false, error: { code: 'no_broadcast_id' } }
  }

  // Re-check cap before sending (defense-in-depth, handles delayed send case)
  const capData = await getClinicCapData(campaign.clinic_id)
  if (!capData) {
    return {
      ok: false,
      error: { code: 'internal_error', message: 'Could not fetch clinic data' },
    }
  }

  const { monthly_message_limit, messages_used_this_month } = capData
  if (messages_used_this_month + campaign.total_recipients > monthly_message_limit) {
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
    // Send broadcast via Kapso
    await kapsoApi.broadcasts.send(campaign.kapso_broadcast_id)

    // Update usage counter
    await incrementClinicUsage(campaign.clinic_id, campaign.total_recipients)

    // Mark first full send if applicable
    if (!campaign.pilot) {
      await markFirstFullSend(campaign.clinic_id)
    }

    return { ok: true, sentCount: campaign.total_recipients }
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'internal_error',
        message: err instanceof Error ? err.message : 'Failed to send broadcast',
      },
    }
  }
}
