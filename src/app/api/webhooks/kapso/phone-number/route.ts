/**
 * POST /api/webhooks/kapso/phone-number
 *
 * Receives WhatsApp message events from Kapso phone-number webhooks (v2 payload):
 *   whatsapp.message.received | .sent | .delivered | .read | .failed
 *
 * Security:
 *   - HMAC-SHA256 verified against X-Webhook-Signature header (raw body).
 *   - Idempotency: message.id used as dedup key in webhook_events table.
 *     INSERT ON CONFLICT DO NOTHING — if the row already exists, ACK 200 immediately.
 *
 * Performance:
 *   - ACK 200 BEFORE heavy work (<500ms guarantee).
 *   - All DB persistence runs inside next/server after() — non-blocking.
 *
 * Middleware: /api/webhooks/** is bypassed — no JWT auth required.
 * Client: admin (service role) — bypasses RLS; clinic_id resolved from phone_number_id.
 */

import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { verifyHmacSignature } from '@/lib/webhook-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { env } from '@/env'
import {
  findOrCreateConversation,
  upsertMessage,
} from '@/server/conversations/repo'

// ─── Kapso v2 phone-number webhook payload types ──────────────────────────────

type KapsoMessageKapso = {
  direction: 'inbound' | 'outbound'
  status: string
  content?: string
}

type KapsoMessage = {
  id: string
  timestamp: string
  type: string
  kapso: KapsoMessageKapso
}

type KapsoConversation = {
  id: string
  phone_number: string
  phone_number_id: string
}

type KapsoPhoneNumberPayload = {
  event?: string
  message?: KapsoMessage
  conversation?: KapsoConversation
  is_new_conversation?: boolean
  phone_number_id?: string
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const start = Date.now()

  // 1. Read raw body ONCE — needed for HMAC verification
  const rawBody = await request.text()

  // 2. HMAC verification against X-Webhook-Signature (raw body bytes)
  const signature = request.headers.get('x-webhook-signature')
  const webhookSecret = env.KAPSO_WEBHOOK_SECRET

  const valid = await verifyHmacSignature(rawBody, signature, webhookSecret)
  if (!valid) {
    console.warn('[webhook/phone-number] Invalid HMAC signature', {
      event: 'hmac_rejected',
      latency_ms: Date.now() - start,
    })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 3. Parse payload
  let payload: KapsoPhoneNumberPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const messageId = payload.message?.id
  const eventType = payload.event ?? 'whatsapp.message.unknown'

  if (!messageId) {
    // Not a message event (e.g. test ping) — ACK silently
    return NextResponse.json({ ok: true })
  }

  // 4. Idempotency check — use message.id as the dedup key
  const admin = createAdminClient()
  const { data: idempotencyRows } = await admin
    .from('webhook_events')
    .insert({ id: messageId, event_type: eventType })
    .select('id')

  const alreadyProcessed = !idempotencyRows || idempotencyRows.length === 0

  if (alreadyProcessed) {
    console.log('[webhook/phone-number] Duplicate — already processed', {
      event: 'idempotency_hit',
      message_id: messageId,
      event_type: eventType,
      latency_ms: Date.now() - start,
    })
    return NextResponse.json({ ok: true })
  }

  // 5. ACK 200 immediately — heavy work runs in after()
  after(async () => {
    const bgStart = Date.now()
    try {
      await processMessageEvent(payload, eventType)
    } catch (err) {
      console.error('[webhook/phone-number] after() error', {
        event: 'after_error',
        message_id: messageId,
        event_type: eventType,
        error: err instanceof Error ? err.message : String(err),
        latency_ms: Date.now() - bgStart,
      })
    }
  })

  console.log('[webhook/phone-number] Accepted', {
    event: 'accepted',
    message_id: messageId,
    event_type: eventType,
    latency_ms: Date.now() - start,
  })

  return NextResponse.json({ ok: true })
}

// ─── Background processing ────────────────────────────────────────────────────

async function processMessageEvent(
  payload: KapsoPhoneNumberPayload,
  eventType: string,
): Promise<void> {
  const admin = createAdminClient()
  const message = payload.message
  const conversation = payload.conversation
  const phoneNumberId = payload.phone_number_id ?? conversation?.phone_number_id

  if (!message || !conversation || !phoneNumberId) return

  // Resolve clinic from phone_number_id
  const { data: clinic } = await admin
    .from('clinics')
    .select('id')
    .eq('whatsapp_phone_number_id', phoneNumberId)
    .single()

  if (!clinic) {
    console.warn('[webhook/phone-number] No clinic for phone_number_id', { phoneNumberId })
    return
  }

  const clinicId = clinic.id

  // Resolve customer by phone_number (best-effort — may not exist yet)
  const { data: customer } = await admin
    .from('customers')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('phone_number', conversation.phone_number)
    .is('deleted_at', null)
    .single()

  // Find or create conversation
  const conv = await findOrCreateConversation(admin, {
    clinic_id: clinicId,
    kapso_conversation_id: conversation.id,
    phone_number: conversation.phone_number,
    customer_id: customer?.id,
  })

  // Upsert message row (idempotent on kapso_message_id)
  const messageTimestamp = message.timestamp
    ? new Date(Number(message.timestamp) * 1000).toISOString()
    : new Date().toISOString()

  await upsertMessage(admin, {
    clinic_id: clinicId,
    conversation_id: conv.id,
    kapso_message_id: message.id,
    direction: message.kapso.direction,
    type: message.type,
    content: message.kapso.content,
    timestamp: messageTimestamp,
  })

  // Update campaign_recipients delivery status for outbound messages
  if (message.kapso.direction === 'outbound') {
    await updateCampaignRecipientStatus(admin, clinicId, conversation.phone_number, eventType)
  }

  // Update responded_at for inbound messages on a campaign recipient
  if (message.kapso.direction === 'inbound') {
    await admin
      .from('campaign_recipients')
      .update({ responded_at: new Date().toISOString(), status: 'responded' })
      .eq('clinic_id', clinicId)
      .eq('phone_number', conversation.phone_number)
      .is('responded_at', null)
      .in('status', ['sent', 'delivered', 'read'])
  }
}

/**
 * Update campaign_recipients delivery tracking fields based on the event type.
 * Only applies to outbound messages that belong to a campaign.
 */
async function updateCampaignRecipientStatus(
  admin: ReturnType<typeof createAdminClient>,
  clinicId: string,
  phoneNumber: string,
  eventType: string,
): Promise<void> {
  const now = new Date().toISOString()

  const updateMap: Record<string, Record<string, unknown>> = {
    'whatsapp.message.sent': { sent_at: now, status: 'sent' },
    'whatsapp.message.delivered': { delivered_at: now, status: 'delivered' },
    'whatsapp.message.read': { read_at: now, status: 'read' },
    'whatsapp.message.failed': { error_message: 'delivery_failed', status: 'failed' },
  }

  const update = updateMap[eventType]
  if (!update) return

  // Only update recipients that are in a campaign context (not excluded)
  // and whose status hasn't already advanced beyond this event.
  const eligibleStatuses: Record<string, string[]> = {
    'whatsapp.message.sent': ['pending'],
    'whatsapp.message.delivered': ['pending', 'sent'],
    'whatsapp.message.read': ['pending', 'sent', 'delivered'],
    'whatsapp.message.failed': ['pending', 'sent'],
  }

  const allowed = eligibleStatuses[eventType]
  if (!allowed) return

  await admin
    .from('campaign_recipients')
    .update(update)
    .eq('clinic_id', clinicId)
    .eq('phone_number', phoneNumber)
    .in('status', allowed)
}
