# Deployment Guide — vet-platform-mvp

Rollout sequence for the Argentine vet clinic WhatsApp platform.
Follow sections in order. Do NOT skip steps — each one is a dependency for the next.

---

## Pre-flight: Environment Variable Checklist

All variables listed below must be configured in Vercel before deploying.
Copy `.env.local.example` to `.env.local` for local dev, but set production values in Vercel dashboard only.

| Variable | Required | Where to get it | Set in |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase → Project → Settings → API | Vercel env (all environments) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase → Project → Settings → API | Vercel env (all environments) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase → Project → Settings → API | Vercel env (server-only, never client) |
| `KAPSO_API_KEY` | Yes | Kapso dashboard → Settings → API Keys | Vercel env |
| `KAPSO_API_BASE_URL` | Yes | `https://api.kapso.ai` (default) | Vercel env |
| `KAPSO_WEBHOOK_SECRET` | Yes | Generate via `openssl rand -hex 32`; configure same value in Kapso webhook settings | Vercel env + Kapso dashboard |
| `KAPSO_AGENT_TOOL_SECRET` | Yes | Generate via `openssl rand -hex 32`; configure same value in Kapso workflow agent-tool header | Vercel env + Kapso workflow config |
| `BUSINESS_ACCOUNT_ID` | Yes | Meta Business Manager → WhatsApp → WABA ID | Vercel env |
| `PHONE_NUMBER_ID` | Yes | Meta Business Manager → WhatsApp → Phone Number ID | Vercel env |
| `NEXT_PUBLIC_PHONE_NUMBER_ID` | Yes | Same as above (needed client-side) | Vercel env |
| `NEXT_PUBLIC_APP_URL` | Yes | Your Vercel production URL, e.g. `https://vet.yourapp.com` | Vercel env + `.env.local` for local dev |
| `CRON_SECRET` | Yes | Generate via `openssl rand -hex 32` | Vercel env ONLY — NOT in `.env.local.example` for prod |
| `SENTRY_DSN` | Optional | Sentry → Project → Settings → Client Keys | Vercel env |
| `SENTRY_AUTH_TOKEN` | Optional | Sentry → Settings → Auth Tokens (for source map upload in CI) | Vercel env / CI secret |

> `CRON_SECRET` is injected by Vercel into cron-triggered requests automatically. Set it in the Vercel dashboard under the project's Environment Variables.

---

## Step 1: Supabase Project Setup

1. Create a new Supabase project in the **São Paulo (sa-east-1)** region.
2. Apply migrations in order:

```bash
# From the repo root
supabase link --project-ref <your-project-ref>
supabase db push
```

Migration order (applied automatically by `db push`):
- `0001_init.sql` — all 10 tables + RLS + membership policies (Spanish species values `perro|gato|ave|conejo|otro` are inlined here)
- `0002_indexes.sql` — partial indexes for segment queries
- `0003_opt_out_events.sql` — opt-out audit table
- `0005_increment_usage_rpc.sql` — atomic RPC for monthly cap increment

> The gap at `0004` is intentional. `0004_fix_species_constraint.sql` was an
> earlier interim migration that fixed the species `CHECK` constraint; its
> changes were later inlined into `0001_init.sql` and the file was deleted.
> Fresh installs only need the files listed above; existing environments that
> already applied `0004` are unaffected.

3. Enable **Email/Password** auth in Supabase Authentication settings.

### First Clinic Seeding

After migrations are applied, insert the first clinic and its admin user:

```sql
-- 1. Have the vet sign up via /login first, then get their user_id from Supabase Auth → Users
-- 2. Seed the clinic
INSERT INTO clinics (
  name,
  whatsapp_phone_number_id,
  whatsapp_business_account_id,
  kapso_workflow_id,
  plan,
  monthly_message_limit,
  usage_period_start
) VALUES (
  'Veterinaria XYZ',
  '<phone_number_id from Meta>',     -- set after Step 3
  '<waba_id from Meta>',
  '<workflow_id from Kapso>',        -- set after Step 2
  'pro',
  2000,
  date_trunc('month', now())::date
) RETURNING id;

-- 3. Link the vet as admin member (replace UUIDs)
INSERT INTO clinic_members (clinic_id, user_id, role)
VALUES ('<clinic_id from above>', '<user_id from Supabase Auth>', 'admin');
```

Update `whatsapp_phone_number_id`, `kapso_workflow_id` after completing Steps 2–3.

---

## Step 2: Kapso Project Setup

1. Create a Kapso project (or use an existing one).
2. Link the local `kapso/` directory to the Kapso project:

```bash
# From the repo root
npx kapso link
```

3. Deploy the `inbound-clinic` workflow:

```bash
npx kapso push
```

Required environment variables for the workflow and agent tools:

| Variable | Value |
|---|---|
| `APP_BASE_URL` | Your Vercel production URL (e.g. `https://vet.yourapp.com`) |
| `KAPSO_AGENT_TOOL_SECRET` | Same value as in Vercel env |
| `CLINIC_PHONE_NUMBER_ID` | Meta phone_number_id for the clinic |

4. After push, note the workflow ID from Kapso dashboard → update `clinics.kapso_workflow_id` in Supabase.

### Kapso: `provider_model_id` for `clinic_agent`

**This cannot be set from source code.** The `clinic_agent` model must be selected in the Kapso dashboard:

1. Navigate to: Kapso Dashboard → Your Project → Workflows → `inbound-clinic` → `clinic_agent` node
2. Under **Model**, pick the desired provider/model (e.g. `openai/gpt-4o-mini` for cost, `openai/gpt-4o` for quality).
3. Save and re-push if required.

Recommended starting point: `openai/gpt-4o-mini` (lower cost, adequate for structured CRM tasks).

---

## Step 3: Kapso Webhook Configuration

Configure TWO webhooks in the Kapso dashboard, both using the same `KAPSO_WEBHOOK_SECRET`.

### 3a. Project-level webhook

In Kapso dashboard → Your Project → Settings → Webhooks → Add webhook:
- URL: `https://<your-domain>/api/webhooks/kapso/project`
- Secret: `<KAPSO_WEBHOOK_SECRET>`
- Events to subscribe:
  - `workflow.execution.handoff`
  - `workflow.execution.failed`
  - `whatsapp.phone_number.created`

### 3b. Phone-number webhook

In Kapso dashboard → Your Project → Phone Numbers → Select phone number → Webhooks → Add webhook:
- URL: `https://<your-domain>/api/webhooks/kapso/phone-number`
- Secret: `<KAPSO_WEBHOOK_SECRET>`
- Events to subscribe:
  - `whatsapp.message.received`
  - `whatsapp.message.sent`
  - `whatsapp.message.delivered`
  - `whatsapp.message.read`
  - `whatsapp.message.failed`

---

## Step 4: Meta Template Submission (CRITICAL PATH)

**Start this in Week 1 — approval takes 24–72 hours and blocks pilot launch.**

Submit 2 templates in Meta Business Manager → WhatsApp → Message Templates:

### Template 1: Vaccine Reminder (UTILITY category)

- **Category**: UTILITY
- **Language**: Spanish (es)
- **Name**: `vaccine_reminder` (or similar)
- **Body**: e.g., `Hola {{1}}, te recordamos que {{2}} tiene su vacuna de {{3}} programada para el {{4}}. Cualquier consulta, respondé este mensaje.`
- **Variables**: customer name, pet name, vaccine type, date

### Template 2: Seasonal Promo (MARKETING category)

- **Category**: MARKETING
- **Language**: Spanish (es)
- **Name**: `seasonal_promo` (or similar)
- **Body**: seasonal message with opt-out footer (required by Meta for MARKETING templates)
- **Opt-out CTA**: must include `Para dejar de recibir mensajes, respondé BAJA.`

> After approval, note the template IDs and names — they are selected in the campaign wizard UI.

---

## Step 5: Sentry Setup (Optional but Recommended)

1. Create a Sentry project (type: Next.js).
2. Copy the DSN from Sentry → Project → Settings → Client Keys (DSN).
3. Add `SENTRY_DSN` to Vercel env.
4. For source map upload in CI, create a Sentry auth token and add `SENTRY_AUTH_TOKEN` to Vercel env.

Without `SENTRY_DSN`, the app builds and runs normally — Sentry init is guarded by `if (dsn)`.

---

## Step 6: Vercel Deployment

1. Connect the GitHub repo to Vercel (or use `vercel link`).
2. Set the Framework Preset to **Next.js**.
3. Configure all environment variables from the Pre-flight checklist in the Vercel dashboard.
4. Set **Function Region** to `gru1` (São Paulo) for lowest latency to Argentine users.
5. Set **Function Max Duration** to `60` seconds (Pro tier — required for webhook safety margin).

### Deployment flow:

```bash
# 1. Deploy preview first
git push origin feat/your-branch
# Vercel auto-deploys preview — test end-to-end with preview URL

# 2. Promote to production
git checkout main && git merge --ff-only feat/your-branch
git push origin main
# Vercel auto-deploys main → production
```

### Cron job:

`vercel.json` already defines the cron:

```json
{
  "crons": [{ "path": "/api/cron/reset-usage", "schedule": "0 2 * * *" }]
}
```

The cron runs daily at 02:00 UTC. Vercel injects `Authorization: Bearer <CRON_SECRET>` automatically.

> `CRON_SECRET` must be set in Vercel dashboard. Do NOT add it to `.env.local.example` in production — use the Vercel UI only.

---

## Step 7: First Pilot Campaign

After all infra is live and at least one template is approved:

1. Import the vet's customer CSV via `/contacts/import`.
2. Do a manual data cleanup pass (check phone number format normalization, deduplicate).
3. Create a segment in `/segments/new` for the pilot group (e.g., "Vacuna de rabia próximas 2 semanas").
4. Create a campaign in `/campaigns/new`:
   - Select the approved template.
   - Select the segment.
   - **Leave "Modo piloto" ON** (default) — limits to 50–100 recipients.
5. Send and monitor for 24–48 hours.

---

## Step 8: Post-Launch Monitoring

Monitor for **48 hours** before enabling full sends:

- **Vercel logs**: Function logs for webhook errors, Sentry errors.
- **Kapso execution logs**: Agent tool error rate, workflow failure rate.
- **Supabase**: Check `opt_out_events`, `campaign_recipients` status distribution.
- **Meta**: Template delivery rates (should be >95% for UTILITY, >85% for MARKETING).

After 48 hours with no critical issues:
- Set `pilot = false` for the clinic's next campaign to enable full sends.
- The system enforces a first-full-send gate: `clinics.first_full_send_at` must be non-null before pilot can be disabled.

---

## Rollback Notes

Each PR in the stacked delivery chain is an autonomous slice with clean commits on `main`.

To roll back a specific slice:

```bash
# Revert a single PR merge commit (adjust SHA)
git revert -m 1 <merge-commit-sha>
git push origin main
# Vercel re-deploys automatically
```

| PR | Branch | Scope | Rollback impact |
|---|---|---|---|
| PR-1 | `feat/pr-1-foundation-auth` | DB migrations + auth | Full rollback — requires DB migration revert |
| PR-2 | `feat/pr-2-crm-csv` | CRM CRUD + CSV import | CRM pages break, API routes removed |
| PR-3 | `feat/pr-3-segments-campaigns` | Segments + broadcast wizard | Campaign wizard reverts to old form |
| PR-4 | `feat/pr-4-webhooks-opt-out` | Webhooks + opt-out | Message tracking stops; opt-out still works via DB |
| PR-5 | `feat/pr-5-cron-workflow-inbox` | Cron + Kapso workflow + inbox | Monthly reset stops; inbox disappears |
| PR-6 | `feat/pr-6-observability-deploy` | Sentry + health + logs | Observability removed; app still functional |

> DB migration rollback requires `supabase migration repair` — coordinate with team before reverting PR-1.

---

## Health Check

The `/api/health` endpoint is available at `GET /api/health` (no auth required):

```json
{
  "db": "ok",
  "kapso": "ok",
  "timestamp": "2026-05-27T00:00:00.000Z"
}
```

Returns HTTP 200 normally. Returns HTTP 503 only if **both** db and kapso checks fail simultaneously.

Configure your uptime monitor (UptimeRobot, Better Stack, etc.) to poll `GET /api/health` every 5 minutes.
