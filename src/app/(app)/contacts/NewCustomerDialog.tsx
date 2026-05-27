'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function NewCustomerDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', phone_number: '', email: '' })

  const handleChange = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
    setError(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.phone_number.trim()) {
      setError('El teléfono es obligatorio')
      return
    }

    startTransition(async () => {
      const res = await fetch('/api/crm/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim() || null,
          phone_number: form.phone_number.trim(),
          email: form.email.trim() || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.error === 'DUPLICATE_PHONE') {
          setError('Ya existe un contacto con ese número de teléfono')
        } else if (data.error === 'INVALID_PHONE') {
          setError('El número de teléfono no es válido. Usá formato internacional (+54...)')
        } else {
          setError(data.message ?? 'Ocurrió un error al crear el contacto')
        }
        return
      }

      setOpen(false)
      setForm({ name: '', phone_number: '', email: '' })
      setError(null)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Nuevo contacto</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Nuevo contacto</DialogTitle>
          <DialogDescription>
            Completá los datos del nuevo contacto. El teléfono es obligatorio.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="phone_number">
                Teléfono <span className="text-destructive">*</span>
              </Label>
              <Input
                id="phone_number"
                placeholder="+54 9 11 1234-5678"
                value={form.phone_number}
                onChange={handleChange('phone_number')}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                placeholder="Nombre del dueño"
                value={form.name}
                onChange={handleChange('name')}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="email@ejemplo.com"
                value={form.email}
                onChange={handleChange('email')}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Guardando...' : 'Guardar contacto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
