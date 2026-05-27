'use client'

/**
 * SegmentBuilder — client island.
 * Lets the user construct a JSON-defined segment with predicates
 * over customers JOIN pets, preview the count, and save.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Eye, Save } from 'lucide-react'
import { toast } from 'sonner'
import type { SegmentRule, SegmentDefinition } from '@/server/segments/types'

const FIELD_LABELS: Record<string, string> = {
  opted_in: 'Tiene activo el marketing',
  has_pet: 'Tiene mascota registrada',
  species: 'Especie de mascota',
  vaccine_due_before: 'Vacuna vence antes de',
  last_visit_before: 'Última visita antes de',
}

const OPERATOR_LABELS: Record<string, string> = {
  is_true: 'Sí',
  is_false: 'No',
  in: 'Es una de',
  before: 'Antes de',
}

type FieldConfig = {
  operators: string[]
  valueType: 'none' | 'species_multi' | 'date'
}

const FIELD_CONFIG: Record<string, FieldConfig> = {
  opted_in: { operators: ['is_true', 'is_false'], valueType: 'none' },
  has_pet: { operators: ['is_true', 'is_false'], valueType: 'none' },
  species: { operators: ['in'], valueType: 'species_multi' },
  vaccine_due_before: { operators: ['before'], valueType: 'date' },
  last_visit_before: { operators: ['before'], valueType: 'date' },
}

const SPECIES_OPTIONS = [
  { value: 'perro', label: 'Perro' },
  { value: 'gato', label: 'Gato' },
  { value: 'ave', label: 'Ave' },
  { value: 'conejo', label: 'Conejo' },
  { value: 'otro', label: 'Otro' },
]

const DEFAULT_RULE: SegmentRule = {
  field: 'opted_in',
  operator: 'is_true',
  value: undefined,
}

function RuleRow({
  rule,
  onChange,
  onRemove,
  canRemove,
}: {
  rule: SegmentRule
  onChange: (rule: SegmentRule) => void
  onRemove: () => void
  canRemove: boolean
}) {
  const config = FIELD_CONFIG[rule.field] ?? { operators: ['is_true'], valueType: 'none' }

  const handleFieldChange = (field: string) => {
    const newConfig = FIELD_CONFIG[field] ?? { operators: ['is_true'], valueType: 'none' }
    onChange({
      field: field as SegmentRule['field'],
      operator: newConfig.operators[0] as SegmentRule['operator'],
      value: undefined,
    })
  }

  const handleSpeciesToggle = (species: string) => {
    const current = Array.isArray(rule.value) ? rule.value : []
    const next = current.includes(species)
      ? current.filter((s) => s !== species)
      : [...current, species]
    onChange({ ...rule, value: next })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 border rounded-lg bg-muted/30">
      {/* Field selector */}
      <Select value={rule.field} onValueChange={handleFieldChange}>
        <SelectTrigger className="w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(FIELD_LABELS).map(([key, label]) => (
            <SelectItem key={key} value={key}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Operator selector */}
      <Select
        value={rule.operator}
        onValueChange={(op) => onChange({ ...rule, operator: op as SegmentRule['operator'] })}
      >
        <SelectTrigger className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {config.operators.map((op) => (
            <SelectItem key={op} value={op}>
              {OPERATOR_LABELS[op] ?? op}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Value input */}
      {config.valueType === 'date' && (
        <Input
          type="date"
          className="w-40"
          value={typeof rule.value === 'string' ? rule.value : ''}
          onChange={(e) => onChange({ ...rule, value: e.target.value })}
        />
      )}

      {config.valueType === 'species_multi' && (
        <div className="flex flex-wrap gap-1">
          {SPECIES_OPTIONS.map((opt) => {
            const selected = Array.isArray(rule.value) && rule.value.includes(opt.value)
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSpeciesToggle(opt.value)}
                className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                  selected
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-foreground border-border hover:bg-muted'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      )}

      {/* Remove rule */}
      {canRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

export function SegmentBuilder() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [combinator, setCombinator] = useState<'and' | 'or'>('and')
  const [rules, setRules] = useState<SegmentRule[]>([{ ...DEFAULT_RULE }])
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [isPreviewing, startPreview] = useTransition()
  const [isSaving, startSave] = useTransition()

  const definition: SegmentDefinition = { combinator, rules }

  function addRule() {
    setRules((prev) => [...prev, { ...DEFAULT_RULE }])
    setPreviewCount(null)
  }

  function updateRule(index: number, rule: SegmentRule) {
    setRules((prev) => prev.map((r, i) => (i === index ? rule : r)))
    setPreviewCount(null)
  }

  function removeRule(index: number) {
    setRules((prev) => prev.filter((_, i) => i !== index))
    setPreviewCount(null)
  }

  function handlePreview() {
    startPreview(async () => {
      try {
        const res = await fetch('/api/segments/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ definition }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Error al previsualizar')
        setPreviewCount(data.count)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error al previsualizar')
      }
    })
  }

  function handleSave() {
    if (!name.trim()) {
      toast.error('El segmento necesita un nombre')
      return
    }
    startSave(async () => {
      try {
        const res = await fetch('/api/segments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), definition }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Error al guardar')
        toast.success('Segmento guardado')
        router.push('/segments')
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error al guardar')
      }
    })
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Nuevo segmento</CardTitle>
        <CardDescription>
          Definí los filtros para armar tu audiencia. El segmento se guarda y podés reutilizarlo en
          múltiples campañas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Name */}
        <div className="space-y-1">
          <label className="text-sm font-medium">Nombre del segmento</label>
          <Input
            placeholder="Ej: Perros con vacuna vencida"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="max-w-sm"
          />
        </div>

        {/* Combinator */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Las reglas se combinan con:</span>
          <Select
            value={combinator}
            onValueChange={(v) => setCombinator(v as 'and' | 'or')}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="and">Y (AND)</SelectItem>
              <SelectItem value="or">O (OR)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Rules */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Reglas del segmento</label>
          {rules.map((rule, index) => (
            <RuleRow
              key={index}
              rule={rule}
              onChange={(r) => updateRule(index, r)}
              onRemove={() => removeRule(index)}
              canRemove={rules.length > 1}
            />
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addRule} className="gap-1">
            <Plus className="h-3 w-3" />
            Agregar regla
          </Button>
        </div>

        {/* Preview result */}
        {previewCount !== null && (
          <div className="flex items-center gap-2 text-sm">
            <span>Este segmento incluiría</span>
            <Badge variant="secondary" className="text-base font-bold">
              {previewCount.toLocaleString('es-AR')}
            </Badge>
            <span>contactos activos.</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handlePreview}
            disabled={isPreviewing}
            className="gap-1"
          >
            <Eye className="h-4 w-4" />
            {isPreviewing ? 'Calculando...' : 'Previsualizar'}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            className="gap-1"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Guardando...' : 'Guardá el segmento'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
