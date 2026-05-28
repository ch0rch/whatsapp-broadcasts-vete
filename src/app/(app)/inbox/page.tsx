/**
 * /inbox — RSC page
 *
 * Lists conversations in 'handoff' status for the authenticated user's clinic.
 * Sorted by created_at DESC (most recent handoff first).
 * No realtime in MVP — vet refreshes manually or polls.
 */

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listHandoffConversations } from '@/server/conversations/repo'
import { Badge } from '@/components/ui/badge'
import { MessageSquare } from 'lucide-react'

export const metadata = {
  title: 'Bandeja de entrada — VetPlatform',
}

async function getClinicId(): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('clinic_members').select('clinic_id').single()
  return data?.clinic_id ?? null
}

function formatRelativeTime(dateStr: string): string {
  const then = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60_000)

  if (diffMins < 1) return 'Ahora'
  if (diffMins < 60) return `Hace ${diffMins} min`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `Hace ${diffHours} h`
  const diffDays = Math.floor(diffHours / 24)
  return `Hace ${diffDays} d`
}

export default async function InboxPage() {
  const clinicId = await getClinicId()

  if (!clinicId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Bandeja de entrada</h1>
        <p className="text-muted-foreground">No se encontró tu clínica. Contactá al administrador.</p>
      </div>
    )
  }

  const admin = createAdminClient()
  const conversations = await listHandoffConversations(admin, clinicId)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bandeja de entrada</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Conversaciones derivadas al equipo humano
          </p>
        </div>
        {conversations.length > 0 && (
          <Badge variant="destructive" className="text-sm px-3 py-1">
            {conversations.length} en espera
          </Badge>
        )}
      </div>

      {conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-4">
          <MessageSquare className="h-10 w-10 opacity-40" />
          <div>
            <p className="font-medium">No hay conversaciones en espera</p>
            <p className="text-sm mt-1">
              Por ahora no hay conversaciones en espera. Las que el agente derive te van a aparecer acá.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map((conv) => (
            <Link
              key={conv.id}
              href={`/inbox/${conv.id}`}
              className="block rounded-lg border bg-card p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm truncate">
                      {conv.customer_name ?? conv.phone_number}
                    </span>
                    {conv.customer_name && (
                      <span className="text-xs text-muted-foreground truncate">
                        {conv.phone_number}
                      </span>
                    )}
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      Espera atención
                    </Badge>
                  </div>
                  {conv.ai_summary && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {conv.ai_summary}
                    </p>
                  )}
                  {!conv.ai_summary && (
                    <p className="text-sm text-muted-foreground italic">
                      Sin resumen del agente
                    </p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                  {formatRelativeTime(conv.created_at)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
