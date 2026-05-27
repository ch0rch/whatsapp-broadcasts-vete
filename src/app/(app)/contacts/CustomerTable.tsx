'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type Customer = {
  id: string
  phone_number: string
  name: string | null
  email: string | null
  opted_out_at: string | null
  deleted_at: string | null
  created_at: string
}

type Props = {
  initialCustomers: Customer[]
  initialTotal: number
}

export default function CustomerTable({ initialCustomers, initialTotal }: Props) {
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers)
  const [total, setTotal] = useState(initialTotal)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const search = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      params.set('page_size', '50')
      const res = await fetch(`/api/crm/customers?${params}`)
      if (!res.ok) return
      const json = await res.json()
      setCustomers(json.data ?? [])
      setTotal(json.meta?.total ?? 0)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value
    setQuery(q)
    // Debounce: search after 300ms of inactivity
    const timer = setTimeout(() => search(q), 300)
    return () => clearTimeout(timer)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Querés eliminar este contacto? Esta acción no se puede deshacer.')) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/crm/customers/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setCustomers((prev) => prev.filter((c) => c.id !== id))
        setTotal((prev) => prev - 1)
      }
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-4">
      <Input
        placeholder="Buscá por nombre o teléfono..."
        value={query}
        onChange={handleQueryChange}
        className="max-w-sm"
      />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {query ? 'Sin resultados para tu búsqueda' : 'Todavía no tenés contactos'}
                  </TableCell>
                </TableRow>
              ) : (
                customers.map((customer) => (
                  <TableRow
                    key={customer.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/contacts/${customer.id}`)}
                  >
                    <TableCell className="font-medium">
                      {customer.name ?? <span className="text-muted-foreground">Sin nombre</span>}
                    </TableCell>
                    <TableCell>{customer.phone_number}</TableCell>
                    <TableCell>
                      {customer.email ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {customer.opted_out_at ? (
                        <Badge variant="destructive">Dado de baja</Badge>
                      ) : (
                        <Badge variant="secondary">Activo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" disabled={deleting === customer.id}>
                            ···
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => router.push(`/contacts/${customer.id}`)}
                          >
                            Ver detalle
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDelete(customer.id)}
                          >
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Mostrando {customers.length} de {total} contactos
      </p>
    </div>
  )
}
