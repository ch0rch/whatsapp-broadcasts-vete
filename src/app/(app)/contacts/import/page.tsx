/**
 * /contacts/import — CSV import wizard (RSC shell).
 * CSVImporter is a full client island.
 */

import CSVImporter from './CSVImporter'

export default function ImportContactsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Importar contactos desde CSV</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Subí un archivo CSV con los datos de tus clientes y mascotas.
          Los números duplicados se omiten automáticamente.
        </p>
      </div>
      <CSVImporter />
    </div>
  )
}
