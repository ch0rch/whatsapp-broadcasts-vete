/**
 * /contacts — Customer list page (RSC shell).
 * CustomerTable is a client island for search input + delete actions.
 */

import Link from 'next/link'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import CustomerTable from './CustomerTable'
import NewCustomerDialog from './NewCustomerDialog'
import { Skeleton } from '@/components/ui/skeleton'

async function getInitialCustomers() {
  const supabase = await createClient()
  const { data, count, error } = await supabase
    .from('customers')
    .select('*', { count: 'exact' })
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(0, 49)

  if (error) throw error
  return { customers: data ?? [], total: count ?? 0 }
}

export default async function ContactsPage() {
  const { customers, total } = await getInitialCustomers()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Contactos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total} {total === 1 ? 'contacto' : 'contactos'} en tu clínica
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/contacts/import"
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            Importar CSV
          </Link>
          <NewCustomerDialog />
        </div>
      </div>

      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <CustomerTable initialCustomers={customers} initialTotal={total} />
      </Suspense>
    </div>
  )
}
