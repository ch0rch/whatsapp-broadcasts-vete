'use client'

/**
 * CampaignStatusPoller — client island for campaign detail page.
 * Polls /api/broadcasts/:kapsoBroadcastId every 5 seconds while status is 'sending'.
 * Displays live stats: sent, delivered, read, responded, failed.
 */

import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { RefreshCw } from 'lucide-react'

type Props = {
  kapsoBroadcastId: string
  initialStatus: string
  initialStats: {
    sent_count: number
    delivered_count: number
    read_count: number
    responded_count: number
    failed_count: number
    total_recipients: number
  }
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  sending: 'Enviando',
  completed: 'Completada',
  failed: 'Error',
}

export function CampaignStatusPoller({ kapsoBroadcastId, initialStatus, initialStats }: Props) {
  const [status, setStatus] = useState(initialStatus)
  const [stats, setStats] = useState(initialStats)
  const [isPolling, setIsPolling] = useState(initialStatus === 'sending')

  useEffect(() => {
    if (!isPolling || !kapsoBroadcastId) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/broadcasts/${kapsoBroadcastId}`)
        if (!res.ok) return
        const data = await res.json()
        const broadcast = data.data
        if (!broadcast) return

        setStatus(broadcast.status)
        setStats({
          sent_count: broadcast.sent_count ?? 0,
          delivered_count: broadcast.delivered_count ?? 0,
          read_count: broadcast.read_count ?? 0,
          responded_count: broadcast.responded_count ?? 0,
          failed_count: broadcast.failed_count ?? 0,
          total_recipients: broadcast.total_recipients ?? 0,
        })

        if (broadcast.status === 'completed' || broadcast.status === 'failed') {
          setIsPolling(false)
        }
      } catch {
        // Silent
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [isPolling, kapsoBroadcastId])

  const responseRate =
    stats.total_recipients > 0
      ? Math.round((stats.responded_count / stats.total_recipients) * 100)
      : 0

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Estado:</span>
        <Badge
          variant={
            status === 'completed'
              ? 'default'
              : status === 'failed'
              ? 'destructive'
              : 'secondary'
          }
        >
          {STATUS_LABELS[status] ?? status}
        </Badge>
        {isPolling && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Actualizando...
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {[
          { label: 'Enviados', value: stats.sent_count },
          { label: 'Entregados', value: stats.delivered_count },
          { label: 'Leídos', value: stats.read_count },
          { label: 'Respondieron', value: stats.responded_count },
          { label: 'Fallidos', value: stats.failed_count },
        ].map(({ label, value }) => (
          <div key={label} className="p-4 border rounded-lg text-center">
            <div className="text-2xl font-bold">{value.toLocaleString('es-AR')}</div>
            <div className="text-xs text-muted-foreground mt-1">{label}</div>
          </div>
        ))}
      </div>

      <div className="p-3 bg-muted rounded-lg text-sm">
        Tasa de respuesta:{' '}
        <strong>{responseRate}%</strong>{' '}
        <span className="text-muted-foreground">
          ({stats.responded_count.toLocaleString('es-AR')} de{' '}
          {stats.total_recipients.toLocaleString('es-AR')})
        </span>
      </div>
    </div>
  )
}
