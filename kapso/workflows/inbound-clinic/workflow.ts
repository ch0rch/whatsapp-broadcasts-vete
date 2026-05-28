/**
 * Inbound Clinic Workflow
 *
 * Single-agent workflow for the Argentine vet clinic WhatsApp channel.
 * Trigger: inbound WhatsApp message from any customer.
 *
 * Graph:
 *   START → clinic_agent (handoff_to_human | session_timeout)
 *
 * Tools (all webhook-based, Bearer-token authenticated):
 *   - lookup_customer  → POST /api/crm/customers/lookup
 *   - upsert_pet       → POST /api/crm/pets/upsert
 *   - mark_opt_out     → POST /api/crm/customers/opt-out
 *   - mark_opt_in      → POST /api/crm/customers/opt-in
 *   - request_handoff  → built-in handoff_to_human (enabled via enabledDefaultTools)
 *
 * Environment variables required at push time:
 *   APP_BASE_URL              — e.g. https://yourapp.vercel.app
 *   KAPSO_AGENT_TOOL_SECRET   — shared bearer-token secret for agent-tool auth
 *   CLINIC_PHONE_NUMBER_ID    — Kapso phone_number_id for the trigger
 *
 * Deploy:
 *   kapso build && kapso push workflow inbound-clinic
 */

import { START, Workflow } from '@kapso/workflows'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} must be set before running 'kapso build' or 'kapso push'. ` +
        `See kapso/workflows/inbound-clinic/workflow.ts for the full list of required vars.`,
    )
  }
  return value
}

const APP_BASE_URL = requireEnv('APP_BASE_URL')
const KAPSO_AGENT_TOOL_SECRET = requireEnv('KAPSO_AGENT_TOOL_SECRET')
const CLINIC_PHONE_NUMBER_ID = requireEnv('CLINIC_PHONE_NUMBER_ID')

// Kapso flow_agent_webhooks can only send static headers (no body signing), so the
// receiving routes use shared-token Bearer auth instead of HMAC-SHA256. HTTPS in
// transit protects the token; same threat model as Kapso's own platform API key.
const AGENT_TOOL_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${KAPSO_AGENT_TOOL_SECRET}`,
}

const workflow = new Workflow('inbound-clinic', {
  name: 'Inbound Clinic',
  status: 'draft',
})

// Trigger: any inbound WhatsApp message on the clinic's phone number
workflow.addTrigger({
  type: 'inbound_message',
  phoneNumberId: CLINIC_PHONE_NUMBER_ID,
  active: true,
})

// START node (required entry point)
workflow.addNode(START, {
  position: { x: 120, y: 60 },
})

// clinic_agent: single LLM agent that handles all conversation routing
workflow.addNode(
  'clinic_agent',
  {
    type: 'agent',
    systemPrompt: readAgentPrompt(),
    // provider_model_id is resolved by the Kapso CLI at push time
    // Use rawConfig to pass it through when running kapso push with a linked project.
    // Leaving providerModel undefined here; set it in the Kapso dashboard or via rawConfig below.
    maxIterations: 20,
    temperature: 0.4,

    // Built-in tools: enable handoff_to_human; the agent calls it explicitly when needed.
    enabledDefaultTools: ['handoff_to_human', 'complete_task'],

    // Custom webhook tools — all HMAC-signed
    webhooks: [
      {
        name: 'lookup_customer',
        description:
          'Look up a customer by phone number and return their name, pets, and next vaccine dates. ' +
          'Always call this first when a customer contacts the clinic to personalize the conversation.',
        url: `${APP_BASE_URL}/api/crm/customers/lookup`,
        method: 'POST',
        headers: AGENT_TOOL_HEADERS,
        bodyTemplate: {
          phone_number: '{{context.channel.from}}',
          phone_number_id: '{{context.channel.phone_number_id}}',
        },
      },
      {
        name: 'upsert_customer',
        description:
          'Create a new customer record or update an existing one (keyed by phone number). ' +
          'Call this when lookup_customer returned {found: false} and you have at minimum the customer name. ' +
          'You MUST call upsert_customer BEFORE upsert_pet for new customers — upsert_pet requires the customer to already exist. ' +
          'Returns {customer_id, action} where action is "created" or "updated".',
        url: `${APP_BASE_URL}/api/crm/customers/upsert`,
        method: 'POST',
        headers: AGENT_TOOL_HEADERS,
        bodyTemplate: {
          phone_number: '{{context.channel.from}}',
          phone_number_id: '{{context.channel.phone_number_id}}',
          name: '{{vars.customer_name}}',
          email: '{{vars.customer_email}}',
          notes: '{{vars.customer_notes}}',
        },
      },
      {
        name: 'upsert_pet',
        description:
          'Create or update a pet record for a customer. ' +
          'Call this when the customer mentions a pet by name, species, age, breed, or any new information. ' +
          'PRECONDITION: the customer must already exist (call upsert_customer first if lookup_customer returned {found: false}). ' +
          'Returns {pet_id, action} where action is "created" or "updated".',
        url: `${APP_BASE_URL}/api/crm/pets/upsert`,
        method: 'POST',
        headers: AGENT_TOOL_HEADERS,
        bodyTemplate: {
          phone_number: '{{context.channel.from}}',
          phone_number_id: '{{context.channel.phone_number_id}}',
          name: '{{vars.pet_name}}',
          species: '{{vars.pet_species}}',
          breed: '{{vars.pet_breed}}',
          birth_year: '{{vars.pet_birth_year}}',
          weight_kg: '{{vars.pet_weight_kg}}',
          notes: '{{vars.pet_notes}}',
        },
      },
      {
        name: 'mark_opt_out',
        description:
          'Unsubscribe the customer from WhatsApp messages. ' +
          'Call this when the customer sends STOP, BASTA, BAJA, NO ENVIAR, CANCELAR, or similar opt-out intent. ' +
          'After calling, reply with the confirmation_text from the response.',
        url: `${APP_BASE_URL}/api/crm/customers/opt-out`,
        method: 'POST',
        headers: AGENT_TOOL_HEADERS,
        bodyTemplate: {
          phone_number: '{{context.channel.from}}',
          phone_number_id: '{{context.channel.phone_number_id}}',
          reason: 'customer_request',
        },
      },
      {
        name: 'mark_opt_in',
        description:
          'Re-subscribe a customer who had previously opted out. ' +
          'Call this when the customer sends ALTA or explicitly asks to receive messages again.',
        url: `${APP_BASE_URL}/api/crm/customers/opt-in`,
        method: 'POST',
        headers: AGENT_TOOL_HEADERS,
        bodyTemplate: {
          phone_number: '{{context.channel.from}}',
          phone_number_id: '{{context.channel.phone_number_id}}',
        },
      },
    ],

    // rawConfig carries provider_model_id and session_timeout which the typed API doesn't expose yet.
    // These values are resolved/overridden by the Kapso platform when the workflow is pushed.
    rawConfig: {
      session_timeout_seconds: 1800, // 30 minutes
    },
  },
  {
    position: { x: 120, y: 200 },
    displayName: 'Agente Clínica',
  },
)

// Linear graph: START → clinic_agent
// The agent ends via handoff_to_human tool call or session_timeout — no explicit END node needed.
workflow.addEdge(START, 'clinic_agent')

export default workflow

/**
 * Returns the agent system prompt.
 * Inlined here so the workflow file is self-contained.
 * The prompt content is in Rioplatense Spanish (voseo) — this is correct because
 * it represents what customers read in responses. Code identifiers stay in English.
 */
function readAgentPrompt(): string {
  return `Sos el asistente digital de la clínica veterinaria. Respondés por WhatsApp de forma cálida, breve y profesional, usando voseo rioplatense. No usás jerga ni lenguaje informal exagerado.

## Tu rol

Ayudás a los dueños de mascotas a:
- Registrar o actualizar información de sus mascotas (nombre, especie, raza, edad, peso)
- Recordar fechas de vacunas y controles
- Gestionar su suscripción a mensajes de la clínica

No das diagnósticos médicos ni consejos de tratamiento.

## Flujo inicial

Al recibir el primer mensaje, llamá a \`lookup_customer\` con el número del cliente para conocer sus datos y los de sus mascotas.

- Si devuelve \`found: true\`: usá la información (nombre, mascotas) para personalizar la respuesta.
- Si devuelve \`found: false\`: el cliente NO está registrado todavía. Saludá cálidamente, presentate como el asistente digital de la clínica, y preguntale su nombre completo para registrarlo. Cuando te dé el nombre, llamá a \`upsert_customer\` con ese dato. Confirmá el registro y recién después pasá a captar datos de mascotas si corresponde.

## Registro de cliente nuevo

Cuando un cliente desconocido pide registrarse o querés bootstrap su perfil:

1. Pedí (al mínimo) el nombre completo. Email y notas son opcionales — no presiones por ellos.
2. Llamá a \`upsert_customer\` con \`name\` obligatorio; \`email\` y \`notes\` solo si el cliente los ofrece.
3. Si el resultado tiene \`action: "created"\`, confirmá: "¡Listo [nombre]! Ya te tengo registrado en la clínica."
4. Si tiene \`action: "updated"\`, confirmá: "Actualicé tus datos, [nombre]."

Después de tener el cliente creado, ya podés capturar datos de mascotas con \`upsert_pet\`.

## Opt-out (baja de mensajes)

Si el cliente escribe alguna de estas palabras (sin importar mayúsculas, tildes, o texto adicional):
STOP, BASTA, BAJA, NO ENVIAR, CANCELAR, NO QUIERO MÁS, DARME DE BAJA

→ Llamá a \`mark_opt_out\` y respondé con el texto exacto de \`confirmation_text\` del resultado.
   Si \`confirmation_text\` no está disponible, respondé: "Listo, no vas a recibir más mensajes de nuestra parte. Si querés volver a recibirlos, respondé ALTA."

## Re-suscripción (alta de mensajes)

Si el cliente escribe ALTA (o "quiero seguir recibiendo mensajes", "volver a recibir mensajes"):
→ Llamá a \`mark_opt_in\` y respondé: "¡Perfecto! Volvés a estar suscripto a nuestros mensajes. Si necesitás algo más, avisanos."

## Captura de datos de mascotas

Cuando el cliente mencione una mascota nueva o actualice información (edad, raza, peso, etc.):

1. **Precondición**: el cliente tiene que estar registrado. Si lookup_customer devolvió \`found: false\` y todavía no llamaste \`upsert_customer\`, hacelo PRIMERO (ver "Registro de cliente nuevo").
2. Usá las variables de contexto para rellenar los campos disponibles del pet.
3. Llamá a \`upsert_pet\` con los datos que tengas.
4. Si el resultado tiene \`action: "created"\`, confirmá el registro: "¡Listo! Registramos a [nombre] en la clínica."
5. Si tiene \`action: "updated"\`, confirmá: "Actualizamos la información de [nombre]."

Especies válidas: perro, gato, ave, conejo, otro.
Si el cliente nombra una especie distinta, mapeala a "otro".

## Cuándo derivar a un humano (handoff_to_human)

Llamá a \`request_handoff\` en cualquiera de estos casos:
- El cliente menciona una urgencia médica: vómito, sangre, accidente, dolor agudo, no come, no puede caminar, convulsiones, dificultad para respirar.
- El cliente pide explícitamente hablar con alguien de la clínica: "quiero hablar con alguien", "necesito atención", "que me llame un veterinario".
- No pudiste entender la intención del cliente en 2 intercambios consecutivos.

Antes de derivar, avisá: "Voy a comunicarte con alguien del equipo de la clínica. En un momento te atienden."

## Tono y estilo

- Voseo: "¿En qué te puedo ayudar?", "¡Claro que sí!", "¿Cuántos años tiene tu mascota?"
- Mensajes cortos (máximo 3-4 oraciones por respuesta).
- Empático pero sin exagerar: "¡Qué lindo nombre!" está bien; varios emojis en cada mensaje, no.
- Si no sabés algo, decilo con honestidad y derivá.
`
}
