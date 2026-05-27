/**
 * /contacts/[id] — Customer detail page (RSC).
 * EditCustomerForm and AddPetDialog are client islands.
 */

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EditCustomerForm from './EditCustomerForm'
import PetCard from './PetCard'
import AddPetDialog from './AddPetDialog'
import { Badge } from '@/components/ui/badge'

type Params = { id: string }

async function getCustomerWithPets(id: string) {
  const supabase = await createClient()
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (customerError || !customer) return null

  const { data: pets } = await supabase
    .from('pets')
    .select('*')
    .eq('customer_id', id)
    .order('created_at', { ascending: true })

  return { customer, pets: pets ?? [] }
}

export default async function CustomerDetailPage({ params }: { params: Promise<Params> }) {
  const { id } = await params
  const result = await getCustomerWithPets(id)

  if (!result) notFound()

  const { customer, pets } = result

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-semibold">
            {customer.name ?? 'Contacto sin nombre'}
          </h1>
          {customer.opted_out_at ? (
            <Badge variant="destructive">Dado de baja</Badge>
          ) : (
            <Badge variant="secondary">Activo</Badge>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          Miembro desde {new Date(customer.created_at).toLocaleDateString('es-AR')}
        </p>
      </div>

      <section>
        <h2 className="text-lg font-medium mb-4">Datos del contacto</h2>
        <EditCustomerForm customer={customer} />
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Mascotas ({pets.length})</h2>
          <AddPetDialog customerId={id} />
        </div>
        {pets.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Este contacto todavía no tiene mascotas registradas.
          </p>
        ) : (
          <div className="grid gap-4">
            {pets.map((pet) => (
              <PetCard key={pet.id} pet={pet} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
