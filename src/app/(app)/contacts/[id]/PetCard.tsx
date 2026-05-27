'use client'

import { Badge } from '@/components/ui/badge'

type Pet = {
  id: string
  name: string
  species: string
  breed: string | null
  birth_date: string | null
  weight_kg: number | null
  next_vaccine_due: string | null
  health_notes: string | null
}

const SPECIES_LABELS: Record<string, string> = {
  dog: 'Perro',
  cat: 'Gato',
  bird: 'Ave',
  rabbit: 'Conejo',
  other: 'Otro',
}

const SPECIES_EMOJI: Record<string, string> = {
  dog: '🐕',
  cat: '🐈',
  bird: '🦜',
  rabbit: '🐇',
  other: '🐾',
}

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('es-AR')
}

function calculateAge(birthDate: string | null): string | null {
  if (!birthDate) return null
  const birth = new Date(birthDate)
  const now = new Date()
  const years = now.getFullYear() - birth.getFullYear()
  const months = now.getMonth() - birth.getMonth()
  const totalMonths = years * 12 + months
  if (totalMonths < 12) return `${totalMonths} mes${totalMonths !== 1 ? 'es' : ''}`
  const y = Math.floor(totalMonths / 12)
  return `${y} año${y !== 1 ? 's' : ''}`
}

export default function PetCard({ pet }: { pet: Pet }) {
  const vaccineDate = formatDate(pet.next_vaccine_due)
  const isVaccineSoon =
    pet.next_vaccine_due
      ? new Date(pet.next_vaccine_due) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      : false

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xl" role="img" aria-label={SPECIES_LABELS[pet.species]}>
          {SPECIES_EMOJI[pet.species] ?? '🐾'}
        </span>
        <div>
          <p className="font-medium">{pet.name}</p>
          <p className="text-sm text-muted-foreground">
            {SPECIES_LABELS[pet.species] ?? pet.species}
            {pet.breed ? ` · ${pet.breed}` : ''}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {pet.birth_date && (
          <>
            <span className="text-muted-foreground">Edad</span>
            <span>{calculateAge(pet.birth_date)} ({formatDate(pet.birth_date)})</span>
          </>
        )}
        {pet.weight_kg && (
          <>
            <span className="text-muted-foreground">Peso</span>
            <span>{pet.weight_kg} kg</span>
          </>
        )}
        {vaccineDate && (
          <>
            <span className="text-muted-foreground">Próxima vacuna</span>
            <span className="flex items-center gap-1">
              {vaccineDate}
              {isVaccineSoon && (
                <Badge variant="outline" className="text-amber-600 border-amber-600 text-xs">
                  Próxima
                </Badge>
              )}
            </span>
          </>
        )}
      </div>

      {pet.health_notes && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Notas de salud</p>
          <p className="text-sm">{pet.health_notes}</p>
        </div>
      )}
    </div>
  )
}
