/**
 * POST /api/webhooks/kapso/project
 *
 * Receives project-level events from Kapso:
 *   workflow.execution.handoff | workflow.execution.completed (mapped from .failed)
 *   whatsapp.phone_number.created
 *
 * Security:
 *   - HMAC-SHA256 verified against X-Webhook-Signature header (raw body).
 *   - Idempotency: workflow_execution_id (or event-specific id) used as dedup key.
 *     INSERT ON CONFLICT DO NOTHING — if the row already exists, ACK 200 immediately.
 *
 * Performance:
 *   - ACK 200 BEFORE heavy work (<500ms guarantee).
 *   - All state mutations run inside next/server after() — non-blocking.
 *
 * Note: `workflow.execution.completed` is NOT in the official Kapso event catalog.
 * The platform emits `workflow.execution.failed` for failures. We handle it here for
 * forward-compatibility but the primary completion signal is the conversation lifecycle.
 *
 * Middleware: /api/webhooks/** is bypassed — no JWT auth required.
 * Client: admin (service role) — bypasses RLS.
 */

import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { verifyHmacSignature } from '@/lib/webhook-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { env } from '@/env'
import {
  getConversationByKapsoId,
  setConversationStatus,
} from '@/server/conversations/repo'

// ─── Kapso v2 project webhook payload types ───────────────────────────────────

type WorkflowExecutionPayload = {
  event: string
  occurred_at?: string
  project_id?: string
  workflow_id?: string
  workflow_execution_id: string
  status?: string
  tracking_id?: string
  channel?: string
  whatsapp_conversation_id?: string
  handoff?: {
    reason?: string
    source?: string
  }
  error?: {
    message?: string
  }
}

type PhoneNumberCreatedPayload = {
  phone_number_id: string
  project?: { id: string }
  customer?: { id: string }
}

type ProjectWebhookPayload = Partial<WorkflowExecutionPayload & PhoneNumberCreatedPayload> & {
  event?: string
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const start = Date.now()

  // 1. Read raw body ONCE — needed for HMAC verification
  const rawBody = await request.text()

  // 2. HMAC verification against X-Webhook-Signature (raw body bytes)
  // Project-level webhooks use a separate secret from phone-number webhooks because
  // Kapso auto-generates the phone-number webhook secret and does not let it be set.
  const signature = request.headers.get('x-webhook-signature')
  const webhookSecret = env.KAPSO_WEBHOOK_SECRET_PROJECT as string

  const valid = await verifyHmacSignature(rawBody, signature, webhookSecret)
  if (!valid) {
    console.warn('[webhook/project] Invalid HMAC signature', {
      event: 'hmac_rejected',
      latency_ms: Date.now() - start,
    })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 3. Parse payload
  let payload: ProjectWebhookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = payload.event ?? 'unknown'

  // Derive a stable idempotency key for this event
  const idempotencyKey = deriveIdempotencyKey(payload, eventType)

  if (!idempotencyKey) {
    // Unknown event type with no identifiable key — ACK and ignore
    console.log('[webhook/project] No idempotency key, ignoring', { event_type: eventType })
    return NextResponse.json({ ok: true })
  }

  // 4. Idempotency check
  const admin = createAdminClient()
  const { data: idempotencyRows, error: idempotencyError } = await admin
    .from('webhook_events')
    .upsert(
      { id: idempotencyKey, event_type: eventType },
      { onConflict: 'id', ignoreDuplicates: true },
    )
    .select('id')

  if (idempotencyError) {
    console.error('[webhook/project] Idempotency check failed', {
      event: 'idempotency_error',
      idempotency_key: idempotencyKey,
      event_type: eventType,
      error: idempotencyError.message,
    })
    // Force Kapso to retry — do not silently ACK on DB error.
    return NextResponse.json({ error: 'idempotency_check_failed' }, { status: 500 })
  }

  const alreadyProcessed = !idempotencyRows || idempotencyRows.length === 0

  if (alreadyProcessed) {
    console.log('[webhook/project] Duplicate — already processed', {
      event: 'idempotency_hit',
      idempotency_key: idempotencyKey,
      event_type: eventType,
      latency_ms: Date.now() - start,
    })
    return NextResponse.json({ ok: true })
  }

  // 5. ACK 200 immediately — mutations run in after()
  after(async () => {
    const bgStart = Date.now()
    try {
      await processProjectEvent(payload, eventType)
    } catch (err) {
      console.error('[webhook/project] after() error', {
        event: 'after_error',
        event_type: eventType,
        idempotency_key: idempotencyKey,
        error: err instanceof Error ? err.message : String(err),
        latency_ms: Date.now() - bgStart,
      })
    }
  })

  console.log('[webhook/project] Accepted', {
    event: 'accepted',
    event_type: eventType,
    idempotency_key: idempotencyKey,
    latency_ms: Date.now() - start,
  })

  return NextResponse.json({ ok: true })
}

// ─── Background processing ────────────────────────────────────────────────────

async function processProjectEvent(
  payload: ProjectWebhookPayload,
  eventType: string,
): Promise<void> {
  const admin = createAdminClient()

  switch (eventType) {
    case 'workflow.execution.handoff': {
      const p = payload as WorkflowExecutionPayload
      const kapsoConvId = p.whatsapp_conversation_id
      if (!kapsoConvId) {
        console.warn('[webhook/project] handoff: missing whatsapp_conversation_id')
        break
      }
      const conv = await getConversationByKapsoId(admin, kapsoConvId)
      if (!conv) {
        console.warn('[webhook/project] handoff: conversation not found', { kapsoConvId })
        break
      }
      // Update status to handoff; store the reason as ai_summary if provided
      const summary = p.handoff?.reason ?? null
      await setConversationStatus(admin, conv.id, 'handoff', summary ?? undefined)
      console.log('[webhook/project] handoff applied', { conversation_id: conv.id })
      break
    }

    case 'workflow.execution.completed':
    case 'workflow.execution.failed': {
      // workflow.execution.completed is forward-compat; .failed marks the workflow as ended.
      // In both cases we mark the conversation as ended.
      const p = payload as WorkflowExecutionPayload
      const kapsoConvId = p.whatsapp_conversation_id
      if (!kapsoConvId) {
        console.warn('[webhook/project] completed/failed: missing whatsapp_conversation_id')
        break
      }
      const conv = await getConversationByKapsoId(admin, kapsoConvId)
      if (!conv) {
        console.warn('[webhook/project] completed/failed: conversation not found', { kapsoConvId })
        break
      }
      await setConversationStatus(admin, conv.id, 'ended')
      console.log('[webhook/project] conversation ended', { conversation_id: conv.id })
      break
    }

    case 'whatsapp.phone_number.created': {
      const p = payload as PhoneNumberCreatedPayload
      // Log and acknowledge. A clinic record is already provisioned manually in MVP.
      // If we wanted to auto-provision, we'd INSERT INTO clinics here.
      // For now, this event is informational — the vet's admin configures the phone_number_id
      // in the clinics row manually (or via settings UI in PR-6).
      console.log('[webhook/project] whatsapp.phone_number.created', {
        phone_number_id: p.phone_number_id,
        kapso_project_id: p.project?.id,
        kapso_customer_id: p.customer?.id,
      })
      // Attempt to update clinics.whatsapp_phone_number_id if we can identify the clinic
      // by the Kapso customer ID. For MVP: log only, no auto-update.
      break
    }

    default:
      console.log('[webhook/project] Unhandled event type', { event_type: eventType })
      break
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Derive a stable idempotency key from the event payload.
 * The key must uniquely identify this specific event delivery.
 */
function deriveIdempotencyKey(payload: ProjectWebhookPayload, eventType: string): string | null {
  // Workflow events: use workflow_execution_id + event type (same execution can have multiple events)
  if (payload.workflow_execution_id) {
    return `${eventType}:${payload.workflow_execution_id}`
  }

  // Phone number created: use phone_number_id + event type
  if (eventType === 'whatsapp.phone_number.created' && payload.phone_number_id) {
    return `${eventType}:${payload.phone_number_id}`
  }

  return null
}
