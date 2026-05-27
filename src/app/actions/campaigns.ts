'use server'

/**
 * Campaign server actions — write path for the wizard.
 *
 * createDraftCampaign: creates a draft campaign row in our DB.
 * hydrateCampaign: segments → recipients → Kapso broadcast + addRecipients.
 * sendCampaignAction: kapsoApi.sendBroadcast + increment usage.
 */

import { createClient } from '@/lib/supabase/server'
import { createCampaign, getCampaign } from '@/server/campaigns/repo'
import { hydrateRecipients } from '@/server/campaigns/hydrate'
import { sendCampaign } from '@/server/campaigns/send'

// ─── createDraftCampaign ─────────────────────────────────────────────────────

export type CreateDraftInput = {
  name: string
  segment_id: string
  template_name: string
  template_id?: string
  pilot: boolean
}

export type CreateDraftResult =
  | { ok: true; campaignId: string }
  | { ok: false; error: string }

export async function createDraftCampaign(
  input: CreateDraftInput,
): Promise<CreateDraftResult> {
  try {
    const supabase = await createClient()
    const { data: membership, error: memErr } = await supabase
      .from('clinic_members')
      .select('clinic_id')
      .single()

    if (memErr || !membership) {
      return { ok: false, error: 'No tenés acceso a una clínica' }
    }

    const campaign = await createCampaign({
      clinic_id: membership.clinic_id,
      segment_id: input.segment_id,
      name: input.name,
      template_name: input.template_name,
      template_id: input.template_id,
      pilot: input.pilot,
    })

    return { ok: true, campaignId: campaign.id }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Error al crear la campaña',
    }
  }
}

// ─── hydrateCampaign ─────────────────────────────────────────────────────────

export type HydrateResult =
  | { ok: true; totalRecipients: number }
  | { ok: false; error: string; code?: string; limit?: number; used?: number }

export async function hydrateCampaign(campaignId: string): Promise<HydrateResult> {
  const phoneNumberId = process.env.PHONE_NUMBER_ID
  if (!phoneNumberId) {
    return { ok: false, error: 'PHONE_NUMBER_ID no está configurado' }
  }

  try {
    const campaign = await getCampaign(campaignId)
    if (!campaign) return { ok: false, error: 'Campaña no encontrada' }

    const result = await hydrateRecipients(campaign, phoneNumberId)

    if (!result.ok) {
      const { error } = result
      if (error.code === 'monthly_cap_reached') {
        return {
          ok: false,
          error: `Llegaste al límite mensual de tu plan (${error.limit.toLocaleString('es-AR')} mensajes). Subí a Pro o esperá al próximo mes.`,
          code: error.code,
          limit: error.limit,
          used: error.used,
        }
      }
      if (error.code === 'no_recipients') {
        return { ok: false, error: 'El segmento no tiene contactos activos' }
      }
      if (error.code === 'no_segment') {
        return { ok: false, error: 'El segmento no existe o fue eliminado' }
      }
      if (error.code === 'force_pilot_required') {
        return {
          ok: false,
          error:
            'Todavía no hiciste tu primer envío piloto. Activá el Modo Piloto para el primer envío.',
          code: error.code,
        }
      }
      return { ok: false, error: (error as { message?: string }).message ?? 'Error interno' }
    }

    return { ok: true, totalRecipients: result.totalRecipients }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Error al preparar la campaña',
    }
  }
}

// ─── sendCampaignAction ──────────────────────────────────────────────────────

export type SendResult =
  | { ok: true; sentCount: number }
  | { ok: false; error: string; code?: string; limit?: number; used?: number }

export async function sendCampaignAction(campaignId: string): Promise<SendResult> {
  try {
    const campaign = await getCampaign(campaignId)
    if (!campaign) return { ok: false, error: 'Campaña no encontrada' }

    const result = await sendCampaign(campaign)

    if (!result.ok) {
      const { error } = result
      if (error.code === 'monthly_cap_reached') {
        return {
          ok: false,
          error: `Llegaste al límite mensual de tu plan (${error.limit.toLocaleString('es-AR')} mensajes). Subí a Pro o esperá al próximo mes.`,
          code: error.code,
          limit: error.limit,
          used: error.used,
        }
      }
      return { ok: false, error: (error as { message?: string }).message ?? 'Error al enviar' }
    }

    return { ok: true, sentCount: result.sentCount }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Error al enviar la campaña',
    }
  }
}
