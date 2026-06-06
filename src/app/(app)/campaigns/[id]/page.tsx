import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getCampaign } from '@/server/campaigns/repo'
import { reconcileCampaign } from '@/server/campaigns/reconcile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CampaignStatusPoller } from '@/components/campaigns/CampaignStatusPoller'
import { ArrowLeft } from 'lucide-react'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const campaign = await getCampaign(id)
  return {
    title: campaign ? `${campaign.name} — VetPlatform` : 'Campaña — VetPlatform',
  }
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  sending: 'Enviando',
  completed: 'Completada',
  failed: 'Error',
}

const STATUS_VARIANTS: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  draft: 'outline',
  sending: 'secondary',
  completed: 'default',
  failed: 'destructive',
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const found = await getCampaign(id)
  if (!found) notFound()
  const campaign = await reconcileCampaign(found)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/campaigns" className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            Campañas
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Creada el {new Date(campaign.created_at).toLocaleDateString('es-AR')}
          </p>
        </div>
      </div>

      {/* Summary card */}
      <Card>
        <CardHeader>
          <CardTitle>Detalles de la campaña</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2">
            <div>
              <span className="font-medium">Template:</span>{' '}
              <span className="text-muted-foreground">{campaign.template_name}</span>
            </div>
            <div>
              <span className="font-medium">Segmento:</span>{' '}
              <span className="text-muted-foreground">
                {campaign.segment?.name ?? '—'}
              </span>
            </div>
            <div>
              <span className="font-medium">Total destinatarios:</span>{' '}
              <span className="text-muted-foreground">
                {campaign.total_recipients.toLocaleString('es-AR')}
              </span>
            </div>
            <div>
              <span className="font-medium">Modo piloto:</span>{' '}
              <Badge variant={campaign.pilot ? 'secondary' : 'outline'} className="text-xs">
                {campaign.pilot ? 'Sí' : 'No'}
              </Badge>
            </div>
            {campaign.sent_at && (
              <div>
                <span className="font-medium">Enviada el:</span>{' '}
                <span className="text-muted-foreground">
                  {new Date(campaign.sent_at).toLocaleString('es-AR')}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Status + live stats */}
      <Card>
        <CardHeader>
          <CardTitle>Estadísticas de entrega</CardTitle>
        </CardHeader>
        <CardContent>
          {campaign.kapso_broadcast_id ? (
            <CampaignStatusPoller
              kapsoBroadcastId={campaign.kapso_broadcast_id}
              initialStatus={campaign.status}
              initialStats={{
                sent_count: campaign.sent_count,
                delivered_count: campaign.delivered_count,
                read_count: campaign.read_count,
                responded_count: campaign.responded_count,
                failed_count: campaign.failed_count,
                total_recipients: campaign.total_recipients,
              }}
            />
          ) : (
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_VARIANTS[campaign.status] ?? 'outline'}>
                {STATUS_LABELS[campaign.status] ?? campaign.status}
              </Badge>
              <span className="text-sm text-muted-foreground">
                No hay broadcast de Kapso asociado todavía.
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
