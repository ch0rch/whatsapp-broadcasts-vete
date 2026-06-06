/**
 * Campaign status reconciliation.
 *
 * Kapso emits no "broadcast completed" webhook — the documented pattern is to
 * poll GET /whatsapp/broadcasts/:id and read its status/completed_at. The detail
 * page poller does this client-side but only updates React state; it never
 * persists. As a result a campaign row stays 'sending' forever once Kapso
 * finishes, and the campaigns list (which reads the DB) shows it stuck.
 *
 * These helpers reconcile on read: for any campaign still 'sending', fetch the
 * real broadcast status and, if terminal, write status + final delivery counts
 * back to the DB. Failures are non-fatal — we return the original campaign so a
 * Kapso hiccup never breaks the page.
 */

import { kapsoApi } from '@/lib/kapso-api'
import { syncCampaignFromBroadcast, type CampaignWithSegment } from './repo'

export async function reconcileCampaign(
  campaign: CampaignWithSegment,
): Promise<CampaignWithSegment> {
  if (campaign.status !== 'sending' || !campaign.kapso_broadcast_id) {
    return campaign
  }

  try {
    const { data: broadcast } = await kapsoApi.broadcasts.get(campaign.kapso_broadcast_id)
    if (!broadcast) return campaign

    // Only persist on a terminal transition; while still sending, the detail
    // page poller covers live progress.
    if (broadcast.status !== 'completed' && broadcast.status !== 'failed') {
      return campaign
    }

    const fields = {
      status: broadcast.status,
      sent_count: broadcast.sent_count ?? 0,
      delivered_count: broadcast.delivered_count ?? 0,
      read_count: broadcast.read_count ?? 0,
      responded_count: broadcast.responded_count ?? 0,
      failed_count: broadcast.failed_count ?? 0,
    }

    await syncCampaignFromBroadcast(campaign.id, fields)
    return { ...campaign, ...fields }
  } catch (err) {
    console.error('[campaigns/reconcile] failed', {
      campaign_id: campaign.id,
      message: err instanceof Error ? err.message : String(err),
    })
    return campaign
  }
}

export async function reconcileCampaigns(
  campaigns: CampaignWithSegment[],
): Promise<CampaignWithSegment[]> {
  return Promise.all(campaigns.map(reconcileCampaign))
}
