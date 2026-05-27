'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type Customer = {
  id: string
  name: string | null
  email: string | null
  phone_number: string
  notes: string | null
}

export default function EditCustomerForm({ customer }: { customer: Customer }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [form, setForm] = useState({
    name: customer.name ?? '',
    email: customer.email ?? '',
    notes: customer.notes ?? '',
  })

  const handleChange =
    (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }))
      setError(null)
      setSuccess(false)
    }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      const res = await fetch(`/api/crm/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim() || null,
          email: form.email.trim() || null,
          notes: form.notes.trim() || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.message ?? 'Ocurrió un error al guardar los cambios')
        return
      }

      setSuccess(true)
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-2">
        <Label>Teléfono</Label>
        <Input value={customer.phone_number} disabled className="bg-muted" />
        <p className="text-xs text-muted-foreground">
          El teléfono no se puede editar.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="name">Nombre</Label>
        <Input
          id="name"
          value={form.name}
          onChange={handleChange('name')}
          placeholder="Nombre del dueño"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={form.email}
          onChange={handleChange('email')}
          placeholder="email@ejemplo.com"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="notes">Notas</Label>
        <Textarea
          id="notes"
          value={form.notes}
          onChange={handleChange('notes')}
          placeholder="Notas internas sobre el contacto..."
          rows={3}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-green-600">Cambios guardados correctamente.</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Guardando...' : 'Guardar cambios'}
      </Button>
    </form>
  )
}
