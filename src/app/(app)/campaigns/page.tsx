import Link from 'next/link'
import { listCampaigns } from '@/server/campaigns/repo'
import { reconcileCampaigns } from '@/server/campaigns/reconcile'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus } from 'lucide-react'

export const metadata = {
  title: 'Campañas — VetPlatform',
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

export default async function CampaignsPage() {
  let campaigns: Awaited<ReturnType<typeof listCampaigns>> = []
  try {
    campaigns = await reconcileCampaigns(await listCampaigns())
  } catch {
    // Empty
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campañas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Historial de campañas de WhatsApp enviadas desde tu clínica.
          </p>
        </div>
        <Button asChild>
          <Link href="/campaigns/new" className="gap-1">
            <Plus className="h-4 w-4" />
            Nueva campaña
          </Link>
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-medium">Todavía no enviaste ninguna campaña</p>
          <p className="text-sm mt-1">
            Creá tu primer campaña para empezar a comunicarte con tus clientes.
          </p>
          <Button asChild className="mt-4">
            <Link href="/campaigns/new">Creá una campaña</Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Segmento</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Destinatarios</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell className="font-medium">{campaign.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {campaign.segment?.name ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {campaign.template_name}
                  </TableCell>
                  <TableCell>
                    {campaign.total_recipients.toLocaleString('es-AR')}
                    {campaign.pilot && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        Piloto
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANTS[campaign.status] ?? 'outline'}>
                      {STATUS_LABELS[campaign.status] ?? campaign.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {campaign.sent_at
                      ? new Date(campaign.sent_at).toLocaleDateString('es-AR')
                      : new Date(campaign.created_at).toLocaleDateString('es-AR')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/campaigns/${campaign.id}`}>Ver detalle</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
