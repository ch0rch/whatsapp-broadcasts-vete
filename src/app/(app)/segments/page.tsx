import Link from 'next/link'
import { listSegments } from '@/server/segments/repo'
import { Button } from '@/components/ui/button'
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
  title: 'Segmentos — VetPlatform',
}

export default async function SegmentsPage() {
  let segments: Awaited<ReturnType<typeof listSegments>> = []
  try {
    segments = await listSegments()
  } catch {
    // RLS: no clinic membership → empty list
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Segmentos</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Agrupá tus contactos por criterios para enviar campañas más relevantes.
          </p>
        </div>
        <Button asChild>
          <Link href="/segments/new" className="gap-1">
            <Plus className="h-4 w-4" />
            Nuevo segmento
          </Link>
        </Button>
      </div>

      {segments.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-medium">Todavía no tenés segmentos</p>
          <p className="text-sm mt-1">
            Creá tu primer segmento para empezar a enviar campañas segmentadas.
          </p>
          <Button asChild className="mt-4">
            <Link href="/segments/new">Creá un segmento</Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Reglas</TableHead>
                <TableHead>Combinación</TableHead>
                <TableHead>Creado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {segments.map((segment) => (
                <TableRow key={segment.id}>
                  <TableCell className="font-medium">{segment.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {segment.definition.rules.length} regla
                    {segment.definition.rules.length !== 1 ? 's' : ''}
                  </TableCell>
                  <TableCell className="uppercase text-xs font-mono text-muted-foreground">
                    {segment.definition.combinator}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(segment.created_at).toLocaleDateString('es-AR')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/campaigns/new?segment=${segment.id}`}>
                        Usar en campaña
                      </Link>
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
