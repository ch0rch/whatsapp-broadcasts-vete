/**
 * /inbox/[id] — RSC shell
 *
 * Loads conversation details and creates a Kapso inbox embed scoped to the
 * conversation's phone_number. Renders the KapsoEmbed client island.
 *
 * The Kapso embed_url is generated server-side via POST /platform/v1/inbox_embeds.
 * It is scoped to the clinic's phone_number_id so the vet sees all messages
 * for that customer number inside the embed.
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getConversation } from '@/server/conversations/repo'
import { kapsoApi } from '@/lib/kapso-api'
import { KapsoEmbed } from '@/components/inbox/KapsoEmbed'
import { ReturnToAIButton } from '@/components/inbox/ReturnToAIButton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Phone } from 'lucide-react'

export const metadata = {
  title: 'Conversación — VetPlatform',
}

type Props = {
  params: Promise<{ id: string }>
}

async function getClinicWithPhoneNumberId(): Promise<{ id: string; whatsapp_phone_number_id: string | null } | null> {
  const supabase = await createClient()
  const { data: membership } = await supabase.from('clinic_members').select('clinic_id').single()
  if (!membership) return null

  const { data: clinic } = await supabase
    .from('clinics')
    .select('id, whatsapp_phone_number_id')
    .eq('id', membership.clinic_id)
    .single()

  return clinic ?? null
}

async function createInboxEmbed(phoneNumberId: string, appOrigin: string): Promise<string | null> {
  try {
    const result = await kapsoApi.inboxEmbeds.create({
      inbox_embed: {
        name: `Inbox embed — ${phoneNumberId}`,
        scope_type: 'phone_number',
        scope_id: phoneNumberId,
        allowed_origins: [appOrigin],
        default_mode: 'system',
      },
    })
    return result.inbox_embed.embed_url
  } catch (err) {
    console.error('[inbox/[id]] failed to create inbox embed', { err, phoneNumberId })
    return null
  }
}

export default async function InboxConversationPage({ params }: Props) {
  const { id } = await params

  const clinic = await getClinicWithPhoneNumberId()
  if (!clinic) notFound()

  const admin = createAdminClient()
  const conversation = await getConversation(admin, clinic.id, id)
  if (!conversation) notFound()

  // Create a Kapso inbox embed scoped to the clinic's phone_number_id.
  // This gives the vet a view of all messages for this customer phone number.
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:4000'
  const embedUrl = clinic.whatsapp_phone_number_id
    ? await createInboxEmbed(clinic.whatsapp_phone_number_id, appOrigin)
    : null

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/inbox">
            <Button variant="ghost" size="icon" className="shrink-0">
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Volver a bandeja</span>
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold">{conversation.phone_number}</span>
              <Badge
                variant={conversation.status === 'handoff' ? 'destructive' : 'secondary'}
                className="text-xs"
              >
                {conversation.status === 'handoff' ? 'Espera atención' : conversation.status}
              </Badge>
            </div>
            {conversation.ai_summary && (
              <p className="text-sm text-muted-foreground mt-1 max-w-lg">
                <span className="font-medium">Resumen del agente:</span> {conversation.ai_summary}
              </p>
            )}
          </div>
        </div>

        {conversation.status === 'handoff' && (
          <ReturnToAIButton conversationId={conversation.id} />
        )}
      </div>

      {/* Kapso embed iframe */}
      <div className="flex-1 border rounded-lg overflow-hidden" style={{ minHeight: '600px' }}>
        <KapsoEmbed
          embedUrl={embedUrl ?? ''}
          phoneNumber={conversation.phone_number}
        />
      </div>
    </div>
  )
}
