import { kapsoApi } from '@/lib/kapso-api'
import { listSegments } from '@/server/segments/repo'
import { CampaignWizard } from '@/components/campaigns/CampaignWizard'
import type { Template } from '@/types'

export const metadata = {
  title: 'Nueva campaña — VetPlatform',
}

/**
 * RSC shell for the campaign wizard.
 * Fetches templates (Kapso) and segments (Supabase) server-side,
 * then passes them as props to the CampaignWizard client island.
 */
export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ segment?: string }>
}) {
  const { segment: defaultSegmentId } = await searchParams

  let templates: Template[] = []
  let segments: Awaited<ReturnType<typeof listSegments>> = []

  const businessAccountId = process.env.BUSINESS_ACCOUNT_ID

  if (businessAccountId) {
    try {
      const res = await kapsoApi.templates.list(businessAccountId, { status: 'APPROVED' })
      templates = res.data ?? []
    } catch (err) {
      // Never swallow silently: a previous empty catch hid a misconfigured
      // BUSINESS_ACCOUNT_ID, leaving the wizard empty with no trace in logs.
      console.error('[campaigns/new] templates fetch failed', {
        message: err instanceof Error ? err.message : String(err),
      })
    }
  } else {
    console.error(
      '[campaigns/new] BUSINESS_ACCOUNT_ID is not set — template selector will be empty',
    )
  }

  try {
    segments = await listSegments()
  } catch {
    // Non-fatal
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Nueva campaña</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Seguí los pasos para enviar un mensaje masivo a tu audiencia.
        </p>
      </div>

      <CampaignWizard
        templates={templates}
        segments={segments}
        defaultSegmentId={defaultSegmentId}
      />
    </div>
  )
}
