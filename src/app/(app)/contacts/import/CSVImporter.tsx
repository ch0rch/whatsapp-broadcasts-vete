'use client'

/**
 * CSVImporter — 3-step import wizard
 *
 * Step 1: Upload CSV file → parse client-side
 * Step 2: Column mapping → assign columns to target fields:
 *         Required: phone
 *         Optional: name
 *         Pet fields (optional): pet_name, species, breed, birth_date, weight_kg, pet_notes
 *         A pet row is created only when BOTH pet_name AND species are mapped AND present.
 * Step 3: Import results → shows counters + error list
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { importContacts } from '@/app/actions/importContacts'
import type { ImportResult } from '@/app/actions/importContacts'

type ColumnRole =
  | 'phone'
  | 'name'
  | 'pet_name'
  | 'species'
  | 'breed'
  | 'birth_date'
  | 'weight_kg'
  | 'pet_notes'
  | 'ignore'

/** Roles that can only be assigned to one column at a time. */
const UNIQUE_ROLES: ColumnRole[] = ['phone', 'name', 'pet_name', 'species', 'breed', 'birth_date', 'weight_kg', 'pet_notes']

function parseRawCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length === 0) return { headers: [], rows: [] }

  const splitLine = (line: string) =>
    line.split(',').map((v) => v.trim().replace(/^["']|["']$/g, ''))

  const headers = splitLine(lines[0])
  const rows = lines.slice(1).map(splitLine)
  return { headers, rows }
}

export default function CSVImporter() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [error, setError] = useState<string | null>(null)

  // Step 1 state
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])

  // Step 2 state
  const [columnRoles, setColumnRoles] = useState<ColumnRole[]>([])

  // Step 3 state
  const [result, setResult] = useState<ImportResult | null>(null)

  // ── Step 1: file upload ──────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setError('El archivo debe ser un CSV')
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const parsed = parseRawCSV(text)

      if (parsed.headers.length === 0) {
        setError('El archivo no tiene columnas detectadas')
        return
      }

      setHeaders(parsed.headers)
      setRows(parsed.rows)
      setColumnRoles(parsed.headers.map(() => 'ignore' as ColumnRole))
      setError(null)
      setStep(2)
    }
    reader.readAsText(file, 'UTF-8')
  }

  // ── Step 2: column mapping ───────────────────────────────────────────────

  const handleRoleChange = (index: number, role: ColumnRole) => {
    setColumnRoles((prev) => {
      const next = [...prev]
      // Each unique role can only be assigned to one column — clear any previous assignment
      if (UNIQUE_ROLES.includes(role)) {
        for (let i = 0; i < next.length; i++) {
          if (next[i] === role) next[i] = 'ignore'
        }
      }
      next[index] = role
      return next
    })
  }

  const phoneColumnIndex = columnRoles.indexOf('phone')
  const petNameColumnIndex = columnRoles.indexOf('pet_name')
  const speciesColumnIndex = columnRoles.indexOf('species')

  const petColumnsPartiallyMapped =
    (petNameColumnIndex >= 0) !== (speciesColumnIndex >= 0)

  const handleImport = () => {
    if (phoneColumnIndex === -1) {
      setError('Tenés que asignar al menos una columna como "Teléfono"')
      return
    }

    if (petColumnsPartiallyMapped) {
      setError('Para importar mascotas necesitás mapear TANTO "Nombre de la mascota" COMO "Especie"')
      return
    }

    startTransition(async () => {
      const nameIdx = columnRoles.indexOf('name')
      const breedIdx = columnRoles.indexOf('breed')
      const birthDateIdx = columnRoles.indexOf('birth_date')
      const weightKgIdx = columnRoles.indexOf('weight_kg')
      const petNotesIdx = columnRoles.indexOf('pet_notes')

      const importRows = rows
        .filter((row) => row[phoneColumnIndex]?.trim())
        .map((row) => ({
          raw_phone: row[phoneColumnIndex] ?? '',
          name: nameIdx >= 0 ? (row[nameIdx]?.trim() || undefined) : undefined,
          pet_name: petNameColumnIndex >= 0 ? (row[petNameColumnIndex]?.trim() || undefined) : undefined,
          species: speciesColumnIndex >= 0 ? (row[speciesColumnIndex]?.trim() || undefined) : undefined,
          breed: breedIdx >= 0 ? (row[breedIdx]?.trim() || undefined) : undefined,
          birth_date: birthDateIdx >= 0 ? (row[birthDateIdx]?.trim() || undefined) : undefined,
          weight_kg: weightKgIdx >= 0 ? (row[weightKgIdx]?.trim() || undefined) : undefined,
          pet_notes: petNotesIdx >= 0 ? (row[petNotesIdx]?.trim() || undefined) : undefined,
        }))

      if (importRows.length === 0) {
        setError('No hay filas con datos de teléfono para importar')
        return
      }

      try {
        const res = await importContacts(importRows)
        setResult(res)
        setStep(3)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al importar')
      }
    })
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="flex items-center gap-4 text-sm">
        {(['Subir archivo', 'Mapear columnas', 'Resultado'] as const).map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                step === i + 1
                  ? 'bg-primary text-primary-foreground'
                  : step > i + 1
                  ? 'bg-green-500 text-white'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {step > i + 1 ? '✓' : i + 1}
            </span>
            <span className={step === i + 1 ? 'font-medium' : 'text-muted-foreground'}>
              {label}
            </span>
            {i < 2 && <span className="text-muted-foreground">→</span>}
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="rounded-lg border-2 border-dashed p-8 text-center">
          <p className="text-muted-foreground mb-4">
            Arrastrá tu CSV acá o hacé clic para seleccionarlo
          </p>
          <label htmlFor="csv-upload">
            <Button asChild variant="outline">
              <span>Seleccionar archivo CSV</span>
            </Button>
          </label>
          <input
            id="csv-upload"
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={handleFileChange}
          />
          <p className="text-xs text-muted-foreground mt-4">
            El CSV puede tener encabezados en la primera fila. Los separadores deben ser comas.
          </p>
        </div>
      )}

      {/* Step 2: Column mapping */}
      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Asigná el rol de cada columna. Al menos <strong>Teléfono</strong> es obligatorio.
          </p>

          <div className="rounded-md border bg-blue-50/50 px-4 py-3 text-sm text-blue-800">
            Si mapeás <strong>Nombre de la mascota</strong> y <strong>Especie</strong>, también cargamos la mascota del cliente. Los dos son necesarios para crear la mascota.
          </div>

          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Columna CSV</th>
                  <th className="px-4 py-2 text-left font-medium">Ejemplo</th>
                  <th className="px-4 py-2 text-left font-medium">Rol</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((header, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-4 py-2 font-mono">{header}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {rows[0]?.[i] ?? '—'}
                    </td>
                    <td className="px-4 py-2">
                      <Select
                        value={columnRoles[i]}
                        onValueChange={(v) => handleRoleChange(i, v as ColumnRole)}
                      >
                        <SelectTrigger className="w-52">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ignore">Ignorar</SelectItem>
                          <SelectItem value="phone">Teléfono</SelectItem>
                          <SelectItem value="name">Nombre del contacto</SelectItem>
                          <SelectItem value="pet_name">Nombre de la mascota</SelectItem>
                          <SelectItem value="species">Especie (perro/gato/ave/conejo/otro)</SelectItem>
                          <SelectItem value="breed">Raza</SelectItem>
                          <SelectItem value="birth_date">Fecha de nacimiento</SelectItem>
                          <SelectItem value="weight_kg">Peso (kg)</SelectItem>
                          <SelectItem value="pet_notes">Notas de la mascota</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-sm text-muted-foreground">
            Se van a procesar <strong>{rows.filter((r) => r[phoneColumnIndex]?.trim()).length}</strong> filas
            con teléfono{phoneColumnIndex === -1 ? ' (ninguna columna asignada aún)' : ''}.
            {petNameColumnIndex >= 0 && speciesColumnIndex >= 0 && (
              <> Las filas con nombre de mascota y especie van a crear también la mascota del cliente.</>
            )}
          </div>

          {petColumnsPartiallyMapped && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Para importar mascotas necesitás mapear <strong>ambos</strong>: &ldquo;Nombre de la mascota&rdquo; y &ldquo;Especie&rdquo;.
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              Volver
            </Button>
            <Button
              onClick={handleImport}
              disabled={isPending || phoneColumnIndex === -1 || petColumnsPartiallyMapped}
            >
              {isPending ? 'Importando...' : 'Iniciar importación'}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Results */}
      {step === 3 && result && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border p-4 text-center">
              <p className="text-3xl font-bold text-green-600">{result.customers_imported}</p>
              <p className="text-sm text-muted-foreground mt-1">
                Importamos {result.customers_imported} contactos nuevos
              </p>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <p className="text-3xl font-bold text-amber-600">{result.customers_skipped_duplicate}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {result.customers_skipped_duplicate} ya estaban en la base
              </p>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <p className="text-3xl font-bold text-blue-600">{result.pets_imported}</p>
              <p className="text-sm text-muted-foreground mt-1">
                Cargamos {result.pets_imported} mascotas
              </p>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <p className="text-3xl font-bold text-muted-foreground">{result.rows_skipped_invalid}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {result.rows_skipped_invalid} filas con datos inválidos (revisá errores)
              </p>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3">
              <p className="text-sm font-medium text-amber-800 mb-2">
                Algunos registros tuvieron errores:
              </p>
              <ul className="text-xs text-amber-700 space-y-1">
                {result.errors.slice(0, 10).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
                {result.errors.length > 10 && (
                  <li>... y {result.errors.length - 10} más</li>
                )}
              </ul>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            Los números duplicados no fueron sobreescritos. Podés reimportar el mismo CSV
            con seguridad — los clientes ya existentes se omiten y las mascotas se actualizan si ya existen.
          </p>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setStep(1)
                setResult(null)
                setHeaders([])
                setRows([])
                setColumnRoles([])
                setError(null)
              }}
            >
              Importar otro archivo
            </Button>
            <Button onClick={() => router.push('/contacts')}>
              Ver contactos
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
