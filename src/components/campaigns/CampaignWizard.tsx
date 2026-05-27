'use client'

/**
 * CampaignWizard — 4-step client island.
 *
 * Step 1: Pick template
 * Step 2: Pick segment + name campaign + pilot toggle
 * Step 3: Preview (counts, confirm pilot)
 * Step 4: Send + result
 *
 * Calls server actions for all writes.
 * Polling on step 4 via setInterval (5s).
 */

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Stepper, type Step } from '@/components/ui/stepper'
import { Send, RefreshCw, ArrowLeft, ArrowRight, CheckCircle, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import {
  createDraftCampaign,
  hydrateCampaign,
  sendCampaignAction,
} from '@/app/actions/campaigns'
import type { Template } from '@/types'
import type { Segment } from '@/server/segments/types'
import { getTemplateParameterInfo } from '@/lib/templates'

const WIZARD_STEPS: Step[] = [
  { title: 'Template', description: 'Elegí el template' },
  { title: 'Segmento', description: 'Definí la audiencia' },
  { title: 'Revisión', description: 'Confirmá los detalles' },
  { title: 'Envío', description: 'Lanzá la campaña' },
]

type Props = {
  templates: Template[]
  segments: Segment[]
  defaultSegmentId?: string
}

export function CampaignWizard({ templates, segments, defaultSegmentId }: Props) {
  const router = useRouter()
  const [step, setStep] = useState(1)

  // Step 1: template
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)

  // Step 2: segment + name + pilot
  const [selectedSegmentId, setSelectedSegmentId] = useState(defaultSegmentId ?? '')
  const [campaignName, setCampaignName] = useState('')
  const [pilot, setPilot] = useState(true)

  // Step 3/4: campaign lifecycle
  const [campaignId, setCampaignId] = useState<string | null>(null)
  const [totalRecipients, setTotalRecipients] = useState<number | null>(null)
  const [hydrateError, setHydrateError] = useState<string | null>(null)
  const [sentCount, setSentCount] = useState<number | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [kapsoStatus, setKapsoStatus] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)

  const [isCreating, startCreate] = useTransition()
  const [isHydrating, startHydrate] = useTransition()
  const [isSending, startSend] = useTransition()

  // Auto-generate campaign name when template + segment are selected
  useEffect(() => {
    if (selectedTemplate && selectedSegmentId && !campaignName) {
      const date = new Date().toISOString().split('T')[0]
      const seg = segments.find((s) => s.id === selectedSegmentId)
      setCampaignName(
        `${selectedTemplate.name}_${seg?.name ?? 'segmento'}_${date}`,
      )
    }
  }, [selectedTemplate, selectedSegmentId, campaignName, segments])

  // Poll kapso broadcast status after send
  useEffect(() => {
    if (!polling || !campaignId) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/broadcasts/${campaignId}/status`)
        if (res.ok) {
          const data = await res.json()
          setKapsoStatus(data.status)
          if (data.status === 'completed' || data.status === 'failed') {
            setPolling(false)
          }
        }
      } catch {
        // Silent — polling is best-effort
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [polling, campaignId])

  // ─── Step navigation ────────────────────────────────────────────────────────

  function handleStep1Next() {
    if (!selectedTemplate) {
      toast.error('Elegí un template antes de continuar')
      return
    }
    setStep(2)
  }

  function handleStep2Next() {
    if (!selectedSegmentId) {
      toast.error('Elegí un segmento')
      return
    }
    if (!campaignName.trim()) {
      toast.error('Poné un nombre a la campaña')
      return
    }

    // Create draft + hydrate
    startCreate(async () => {
      const draftResult = await createDraftCampaign({
        name: campaignName.trim(),
        segment_id: selectedSegmentId,
        template_name: selectedTemplate!.name,
        template_id: selectedTemplate!.id,
        pilot,
      })

      if (!draftResult.ok) {
        toast.error(draftResult.error)
        return
      }

      const id = draftResult.campaignId
      setCampaignId(id)
      setStep(3)

      // Auto-hydrate
      startHydrate(async () => {
        const hydrateResult = await hydrateCampaign(id)
        if (!hydrateResult.ok) {
          setHydrateError(hydrateResult.error)
          toast.error(hydrateResult.error)
        } else {
          setTotalRecipients(hydrateResult.totalRecipients)
          setHydrateError(null)
        }
      })
    })
  }

  function handleStep3Send() {
    if (!campaignId) return
    startSend(async () => {
      const result = await sendCampaignAction(campaignId)
      if (!result.ok) {
        setSendError(result.error)
        toast.error(result.error)
      } else {
        setSentCount(result.sentCount)
        setSendError(null)
        setPolling(true)
        setStep(4)
        toast.success(`Campaña enviada a ${result.sentCount.toLocaleString('es-AR')} contactos`)
      }
    })
  }

  const isLoading = isCreating || isHydrating || isSending
  const selectedSegment = segments.find((s) => s.id === selectedSegmentId)
  const paramInfo = selectedTemplate ? getTemplateParameterInfo(selectedTemplate) : []

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-2xl">
      <Stepper steps={WIZARD_STEPS} currentStep={step} onStepClick={(s) => s < step && setStep(s)} />

      {/* Step 1 — Template */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Elegí el template</CardTitle>
            <CardDescription>
              Seleccioná un template de WhatsApp aprobado por Meta para tu campaña.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select
              value={selectedTemplate?.id ?? ''}
              onValueChange={(v) => {
                const t = templates.find((t) => t.id === v)
                setSelectedTemplate(t ?? null)
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Elegí un template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}{' '}
                    <span className="text-muted-foreground text-xs ml-1">
                      ({t.language_code ?? t.language})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedTemplate && (
              <div className="p-4 bg-muted rounded-lg space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">Categoría:</span>
                  <Badge variant="secondary">{selectedTemplate.category}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Estado:</span>
                  <Badge
                    variant={selectedTemplate.status === 'APPROVED' ? 'default' : 'destructive'}
                  >
                    {selectedTemplate.status}
                  </Badge>
                </div>
                {selectedTemplate.content && (
                  <div className="pt-2 border-t">
                    <p className="font-medium mb-1">Contenido:</p>
                    <p className="text-muted-foreground whitespace-pre-wrap">
                      {selectedTemplate.content}
                    </p>
                  </div>
                )}
                {paramInfo.length > 0 && (
                  <div className="pt-2 border-t">
                    <p className="font-medium mb-1">
                      Parámetros requeridos: {paramInfo.length}
                    </p>
                    <div className="font-mono text-xs space-y-1">
                      {paramInfo.map((p, i) => (
                        <div key={i}>
                          {p.name}:{' '}
                          <span className="text-muted-foreground">{p.example}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={handleStep1Next} disabled={!selectedTemplate} className="gap-1">
                Siguiente
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2 — Segment + name + pilot */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Configurá la campaña</CardTitle>
            <CardDescription>
              Elegí la audiencia, poné un nombre y decidí si querés hacer un envío piloto primero.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Segment */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Segmento (audiencia)</label>
              <Select value={selectedSegmentId} onValueChange={setSelectedSegmentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Elegí un segmento..." />
                </SelectTrigger>
                <SelectContent>
                  {segments.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {segments.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Todavía no tenés segmentos.{' '}
                  <a href="/segments/new" className="text-primary underline">
                    Creá uno
                  </a>
                  .
                </p>
              )}
            </div>

            {/* Name */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Nombre de la campaña</label>
              <Input
                placeholder="Ej: Vacunas vencidas — junio 2025"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
              />
            </div>

            {/* Pilot toggle */}
            <div className="flex items-start gap-3 p-3 border rounded-lg">
              <Checkbox
                id="pilot"
                checked={pilot}
                onCheckedChange={(v) => setPilot(Boolean(v))}
              />
              <div>
                <label htmlFor="pilot" className="text-sm font-medium cursor-pointer">
                  Modo piloto (máx. 100 destinatarios)
                </label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Recomendado para el primer envío. Enviá a una muestra aleatoria de 100 contactos
                  para validar el template antes del envío completo.
                </p>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)} className="gap-1">
                <ArrowLeft className="h-4 w-4" />
                Atrás
              </Button>
              <Button
                onClick={handleStep2Next}
                disabled={isLoading || !selectedSegmentId || !campaignName.trim()}
                className="gap-1"
              >
                {isCreating ? 'Creando...' : 'Continuar'}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3 — Preview + confirm */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Revisá antes de enviar</CardTitle>
            <CardDescription>
              Confirmá los detalles de la campaña antes de lanzarla.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="p-4 bg-muted rounded-lg space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="font-medium">Template:</span>
                <span>{selectedTemplate?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Segmento:</span>
                <span>{selectedSegment?.name ?? selectedSegmentId}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Nombre:</span>
                <span>{campaignName}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Modo piloto:</span>
                <Badge variant={pilot ? 'secondary' : 'outline'}>
                  {pilot ? 'Sí (máx. 100)' : 'No'}
                </Badge>
              </div>
            </div>

            {/* Hydration result */}
            {isHydrating && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Preparando destinatarios...
              </div>
            )}

            {!isHydrating && hydrateError && (
              <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive rounded-lg text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{hydrateError}</span>
              </div>
            )}

            {!isHydrating && totalRecipients !== null && !hydrateError && (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span>
                  Listo para enviar a{' '}
                  <strong>{totalRecipients.toLocaleString('es-AR')}</strong> contacto
                  {totalRecipients !== 1 ? 's' : ''}.
                </span>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)} className="gap-1">
                <ArrowLeft className="h-4 w-4" />
                Atrás
              </Button>
              <Button
                onClick={handleStep3Send}
                disabled={
                  isSending ||
                  isHydrating ||
                  !!hydrateError ||
                  totalRecipients === null ||
                  totalRecipients === 0
                }
                className="gap-1"
              >
                <Send className="h-4 w-4" />
                {isSending
                  ? 'Enviando...'
                  : `Enviá a ${(totalRecipients ?? 0).toLocaleString('es-AR')} contactos`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4 — Result + polling */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Campaña enviada</CardTitle>
            <CardDescription>
              Tu campaña está en camino. El estado se actualiza en tiempo real.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {sendError ? (
              <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive rounded-lg text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{sendError}</span>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="font-medium">
                    Mensajes enviados:{' '}
                    <strong>{(sentCount ?? 0).toLocaleString('es-AR')}</strong>
                  </span>
                </div>

                {polling && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Actualizando estado de entrega...
                  </div>
                )}

                {kapsoStatus && (
                  <div className="flex items-center gap-2 text-sm">
                    <span>Estado Kapso:</span>
                    <Badge variant="secondary" className="capitalize">
                      {kapsoStatus}
                    </Badge>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  router.push('/campaigns')
                  router.refresh()
                }}
              >
                Ver todas las campañas
              </Button>
              <Button
                onClick={() => {
                  setStep(1)
                  setSelectedTemplate(null)
                  setSelectedSegmentId(defaultSegmentId ?? '')
                  setCampaignName('')
                  setPilot(true)
                  setCampaignId(null)
                  setTotalRecipients(null)
                  setHydrateError(null)
                  setSentCount(null)
                  setSendError(null)
                  setPolling(false)
                  setKapsoStatus(null)
                }}
              >
                Nueva campaña
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
