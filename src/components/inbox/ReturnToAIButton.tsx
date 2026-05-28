'use client'

/**
 * ReturnToAIButton — client island
 *
 * On click: calls server action `returnConversationToAI(conversationId)` which:
 * 1. Updates conversations.status = 'active' (only if currently 'handoff')
 * 2. Attempts to resume the Kapso workflow execution (if executionId is known).
 *    If resume fails or no executionId, the next inbound message from the customer
 *    will trigger a fresh workflow execution (acceptable for MVP).
 *
 * Toast: voseo, brief.
 * Navigation: pushes to /inbox after success.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Bot } from 'lucide-react'
import { returnConversationToAI } from '@/app/actions/conversations'

type ReturnToAIButtonProps = {
  conversationId: string
}

export function ReturnToAIButton({ conversationId }: ReturnToAIButtonProps) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleReturn() {
    setLoading(true)
    try {
      const result = await returnConversationToAI(conversationId)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success('Devolvimos la conversación al agente IA.')
        router.push('/inbox')
      }
    } catch {
      toast.error('Hubo un error. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleReturn}
      disabled={loading}
      className="gap-2"
    >
      <Bot className="h-4 w-4" />
      {loading ? 'Procesando...' : 'Volver al agente IA'}
    </Button>
  )
}
