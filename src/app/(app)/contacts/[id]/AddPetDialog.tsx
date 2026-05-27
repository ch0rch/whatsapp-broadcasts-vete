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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const SPECIES_OPTIONS = [
  { value: 'perro', label: 'Perro' },
  { value: 'gato', label: 'Gato' },
  { value: 'ave', label: 'Ave' },
  { value: 'conejo', label: 'Conejo' },
  { value: 'otro', label: 'Otro' },
]

type Props = {
  customerId: string
}

export default function AddPetDialog({ customerId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    species: '',
    breed: '',
    birth_date: '',
    weight_kg: '',
    next_vaccine_due: '',
  })

  const handleChange =
    (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }))
      setError(null)
    }

  const handleSpeciesChange = (value: string) => {
    setForm((prev) => ({ ...prev, species: value }))
    setError(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('El nombre es obligatorio')
      return
    }
    if (!form.species) {
      setError('La especie es obligatoria')
      return
    }

    startTransition(async () => {
      const res = await fetch(`/api/crm/customers/${customerId}/pets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          species: form.species,
          breed: form.breed.trim() || null,
          birth_date: form.birth_date || null,
          weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
          next_vaccine_due: form.next_vaccine_due || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.error === 'INVALID_SPECIES') {
          setError('Especie no válida')
        } else {
          setError(data.message ?? 'Ocurrió un error al guardar la mascota')
        }
        return
      }

      setOpen(false)
      setForm({ name: '', species: '', breed: '', birth_date: '', weight_kg: '', next_vaccine_due: '' })
      setError(null)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Agregar mascota
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Nueva mascota</DialogTitle>
          <DialogDescription>
            Completá los datos de la mascota. Nombre y especie son obligatorios.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="pet-name">
                Nombre <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pet-name"
                placeholder="Nombre de la mascota"
                value={form.name}
                onChange={handleChange('name')}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label>
                Especie <span className="text-destructive">*</span>
              </Label>
              <Select value={form.species} onValueChange={handleSpeciesChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccioná una especie" />
                </SelectTrigger>
                <SelectContent>
                  {SPECIES_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pet-breed">Raza</Label>
              <Input
                id="pet-breed"
                placeholder="Ej: Labrador, Siamés"
                value={form.breed}
                onChange={handleChange('breed')}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="pet-birth">Fecha de nacimiento</Label>
                <Input
                  id="pet-birth"
                  type="date"
                  value={form.birth_date}
                  onChange={handleChange('birth_date')}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pet-weight">Peso (kg)</Label>
                <Input
                  id="pet-weight"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="Ej: 12.5"
                  value={form.weight_kg}
                  onChange={handleChange('weight_kg')}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pet-vaccine">Próxima vacuna</Label>
              <Input
                id="pet-vaccine"
                type="date"
                value={form.next_vaccine_due}
                onChange={handleChange('next_vaccine_due')}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Guardando...' : 'Guardar mascota'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
