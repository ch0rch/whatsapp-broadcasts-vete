import { SegmentBuilder } from '@/components/segments/SegmentBuilder'

export const metadata = {
  title: 'Nuevo segmento — VetPlatform',
}

/**
 * RSC shell — renders the SegmentBuilder client island.
 * The client island handles preview (server action via fetch) and save.
 */
export default function NewSegmentPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Nuevo segmento</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Definí los filtros para armar tu audiencia.
        </p>
      </div>
      <SegmentBuilder />
    </div>
  )
}
