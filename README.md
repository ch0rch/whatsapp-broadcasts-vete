# vet-platform-mvp

WhatsApp-first operational platform for a small/medium veterinary clinic. Re-engages existing customers from a long-built database via outbound broadcast campaigns (Meta-approved templates) and turns every inbound conversation into a structured exchange driven by an AI agent with handoff to a human inbox.

Originally forked from [`gokapso/whatsapp-broadcasts-example`](https://github.com/gokapso/whatsapp-broadcasts-example) and extended into a full single-tenant platform (multi-tenant-ready schema underneath).

## What's in the box

- **Auth & tenancy** — Supabase Auth + per-clinic membership; Row Level Security on every domain table, scoped by `clinic_members` lookup.
- **CRM** — customers + pets with Spanish species values (`perro|gato|ave|conejo|otro`), soft-delete, dedupe by phone.
- **CSV import** — bulk customer + pet ingest with normalization and duplicate detection.
- **Segments** — visual builder that compiles a normalized filter tree into Postgres queries against partial indexes.
- **Broadcasts** — 5-step wizard (template → segment → preview → send → progress) using Kapso's Broadcasts API. Live delivery stats polled from Kapso, not from the local DB.
- **Inbox** — conversations + messages, AI agent powered by a Kapso workflow (`inbound-clinic`) with handoff via embeddable conversation view.
- **Opt-out** — keyword detection on inbound messages, admin-driven opt-out, and an immutable `opt_out_events` audit log.
- **Usage cap** — monthly per-clinic message limit with an atomic Postgres RPC + a daily Vercel cron that resets the counter.
- **Observability** — Sentry (server / client / edge), structured JSON logs across API routes, and a `/api/health` endpoint for uptime monitors.

## Stack

- **Next.js 15** (App Router) on Vercel — region `gru1` (São Paulo) for low latency to Argentine users.
- **Supabase** Postgres + Auth — single-tenant logically, multi-tenant-ready physically (`clinic_id` on every domain row, RLS enabled by default).
- **Kapso** workflow runtime for the conversational layer (`kapso/workflows/inbound-clinic`) and Broadcasts API for outbound campaigns.
- **Sentry** for error tracking; structured logs and `/api/health` for liveness.

## Status

MVP is feature-complete: 14 work units shipped across 6 stacked PRs, verified, and archived under the project's SDD (spec-driven development) workflow. See `docs/DEPLOY.md` for the production rollout sequence.

## Deployment

Production rollout is **not** a one-click affair — it requires Meta template submission (24–72 h approval), Kapso workflow configuration, webhook setup, and Supabase migrations. The canonical step-by-step is:

- [`docs/DEPLOY.md`](docs/DEPLOY.md) — full environment variable checklist, Supabase setup, Kapso project link & push, Meta template guidance, Vercel config (region, function duration, env vars, cron), and pilot launch checklist.

For testing without a full Meta WABA, the Kapso sandbox phone number is enough to validate the inbound flow end-to-end (templates are sandbox-disabled by Kapso, so broadcasts require a real WABA).

## Local development

```bash
git clone https://github.com/ch0rch/whatsapp-broadcasts-vete.git
cd whatsapp-broadcasts-vete
npm install

cp .env.local.example .env.local
# Fill in Supabase, Kapso, Meta, and secrets — see docs/DEPLOY.md for the full list

npm run dev
# Open http://localhost:4000
```

## Repository layout

```
src/
├── app/
│   ├── (app)/                  # Authenticated app routes (dashboard, contacts, segments, campaigns, inbox)
│   ├── (auth)/                 # Login, signup, password reset
│   ├── actions/                # Server Actions (campaigns, customers, segments, opt-out)
│   └── api/
│       ├── broadcasts/         # Kapso Broadcasts API proxy
│       ├── templates/          # Meta template list (via Kapso)
│       ├── cron/               # Vercel cron handlers (usage reset)
│       ├── health/             # Liveness probe
│       ├── kapso/              # Kapso agent-tool endpoints (Bearer-authenticated)
│       └── webhooks/
│           └── kapso/          # Inbound webhook receivers (HMAC-signed)
├── components/                 # UI primitives + feature components
├── lib/                        # Kapso client, Supabase client, auth helpers, log helper
└── server/                     # Server-only modules: repos, services

kapso/
├── workflows/inbound-clinic/   # Conversation workflow (agent + tools + triggers)
└── agents/clinic-agent/        # Agent prompt (voseo, vet-domain instructions)

supabase/migrations/            # Schema migrations (0001, 0002, 0003, 0005, 0006)
docs/DEPLOY.md                  # Production rollout runbook
vercel.json                     # Cron schedule
sentry.*.config.ts              # Sentry init per runtime (server, client, edge)
instrumentation.ts              # Next.js instrumentation hook (Sentry)
```

## License

MIT — inherited from the upstream example. See git history for the diff against the original fork.
