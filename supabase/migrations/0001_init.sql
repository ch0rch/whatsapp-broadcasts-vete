-- vet-platform-mvp: initial schema
-- 10 tables + RLS + membership policies
-- Run: supabase db push

-- ──────────────────────────────────────────
-- 1. CORE TABLES
-- ──────────────────────────────────────────

create table clinics (
  id                         uuid primary key default gen_random_uuid(),
  name                       text not null,
  whatsapp_phone_number_id   text,
  whatsapp_business_account_id text,
  kapso_workflow_id          text,
  plan                       text not null default 'free',       -- 'free' | 'pro'
  monthly_message_limit      int  not null default 2000,
  messages_used_this_month   int  not null default 0,
  usage_period_start         date not null default (date_trunc('month', now())::date),
  first_full_send_at         timestamptz,                        -- NULL until first non-pilot broadcast sent
  created_at                 timestamptz default now()
);

create table clinic_members (
  clinic_id  uuid references clinics on delete cascade,
  user_id    uuid references auth.users on delete cascade,
  role       text not null default 'admin',                      -- 'admin' | 'staff'
  created_at timestamptz default now(),
  primary key (clinic_id, user_id)
);

create table customers (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinics on delete cascade,
  phone_number text not null,                                    -- E.164
  name         text,
  email        text,
  notes        text,
  opted_out_at timestamptz,
  deleted_at   timestamptz,                                      -- soft-delete
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique (clinic_id, phone_number)
);

create table pets (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references clinics on delete cascade,
  customer_id       uuid not null references customers on delete cascade,
  name              text not null,
  species           text not null check (species in ('dog','cat','bird','other')),
  breed             text,
  birth_date        date,
  weight_kg         numeric(5,2),
  last_visit_date   date,
  next_vaccine_due  date,
  health_notes      text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create table segments (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics on delete cascade,
  name       text not null,
  definition jsonb not null,                                     -- normalized filter tree
  created_at timestamptz default now()
);

create table campaigns (
  id                  uuid primary key default gen_random_uuid(),
  clinic_id           uuid not null references clinics on delete cascade,
  segment_id          uuid references segments,
  name                text not null,
  template_name       text not null,
  template_id         text,
  kapso_broadcast_id  text,
  status              text not null default 'draft'
                        check (status in ('draft','sending','completed','failed')),
  pilot               boolean not null default false,
  pilot_cap           int not null default 100,
  total_recipients    int default 0,
  sent_count          int default 0,
  delivered_count     int default 0,
  read_count          int default 0,
  responded_count     int default 0,
  failed_count        int default 0,
  scheduled_at        timestamptz,
  sent_at             timestamptz,
  created_at          timestamptz default now()
);

create table campaign_recipients (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references clinics on delete cascade,
  campaign_id      uuid not null references campaigns on delete cascade,
  customer_id      uuid references customers,
  phone_number     text not null,
  status           text not null default 'pending'
                     check (status in ('pending','sent','delivered','read','responded','failed','excluded')),
  excluded_reason  text,                                         -- e.g. 'opted_out_excluded', 'pilot_cap_reached'
  sent_at          timestamptz,
  delivered_at     timestamptz,
  read_at          timestamptz,
  responded_at     timestamptz,
  error_message    text,
  created_at       timestamptz default now()
);

create table conversations (
  id                    uuid primary key default gen_random_uuid(),
  clinic_id             uuid not null references clinics on delete cascade,
  customer_id           uuid references customers,
  kapso_conversation_id text unique,
  phone_number          text not null,
  status                text not null default 'active'
                          check (status in ('active','handoff','ended')),
  campaign_id           uuid references campaigns,
  ai_summary            text,
  created_at            timestamptz default now(),
  ended_at              timestamptz
);

create table messages (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references clinics on delete cascade,
  conversation_id   uuid not null references conversations on delete cascade,
  kapso_message_id  text,
  direction         text not null check (direction in ('inbound','outbound')),
  type              text not null default 'text',
  content           text,
  campaign_id       uuid references campaigns,
  timestamp         timestamptz not null,
  created_at        timestamptz default now(),
  unique (kapso_message_id)
);

create table webhook_events (
  id          text primary key,                                  -- X-Idempotency-Key or event id
  event_type  text not null,
  received_at timestamptz default now()
);

create table opt_out_events (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinics on delete cascade,
  customer_id  uuid not null references customers on delete cascade,
  triggered_by text not null check (triggered_by in ('inbound_message','admin','opt_in')),
  raw_message  text,
  triggered_at timestamptz not null default now()
);

-- ──────────────────────────────────────────
-- 2. ROW LEVEL SECURITY
-- ──────────────────────────────────────────

alter table clinics enable row level security;
alter table clinic_members enable row level security;
alter table customers enable row level security;
alter table pets enable row level security;
alter table segments enable row level security;
alter table campaigns enable row level security;
alter table campaign_recipients enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table webhook_events enable row level security;
alter table opt_out_events enable row level security;

-- Helper: is the current user a member of the clinic?
-- Used inline in each policy to avoid a function that could bypass RLS.

-- clinics: visible only to members
create policy clinics_select on clinics for select
  using (
    id in (
      select clinic_id from clinic_members where user_id = auth.uid()
    )
  );

-- clinic_members: visible to members of that clinic
create policy clinic_members_select on clinic_members for select
  using (
    clinic_id in (
      select clinic_id from clinic_members where user_id = auth.uid()
    )
  );

-- customers: all operations scoped to membership
create policy customers_select on customers for select
  using (
    clinic_id in (
      select clinic_id from clinic_members where user_id = auth.uid()
    )
  );

create policy customers_modify on customers for all
  using (
    clinic_id in (
      select clinic_id from clinic_members where user_id = auth.uid()
    )
  )
  with check (
    clinic_id in (
      select clinic_id from clinic_members where user_id = auth.uid()
    )
  );

-- pets: same membership pattern
create policy pets_select on pets for select
  using (
    clinic_id in (
      select clinic_id from clinic_members where user_id = auth.uid()
    )
  );

create policy pets_modify on pets for all
  using (
    clinic_id in (
      select clinic_id from clinic_members where user_id = auth.uid()
    )
  )
  with check (
    clinic_id in (
      select clinic_id from clinic_members where user_id = auth.uid()
    )
  );

-- segments
create policy segments_select on segments for select
  using (
    clinic_id in (
      select clinic_id from clinic_members where user_id = auth.uid()
    )
  );

create policy segments_modify on segments for all
  using (
    clinic_id in (
      select clinic_id from clinic_members where user_id = auth.uid()
    )
  )
  with check (
    clinic_id in (
      select clinic_id from clinic_members where user_id = auth.uid()
    )
  );

-- campaigns
create policy campaigns_select on campaigns for select
  using (
    clinic_id in (
      select clinic_id from clinic_members where user_id = auth.uid()
    )
  );

create policy campaigns_modify on campaigns for all
  using (
    clinic_id in (
      select clinic_id from clinic_members where user_id = auth.uid()
    )
  )
  with check (
    clinic_id in (
      select clinic_id from clinic_members where user_id = auth.uid()
    )
  );

-- campaign_recipients
create policy campaign_recipients_select on campaign_recipients for select
  using (
    clinic_id in (
      select clinic_id from clinic_members where user_id = auth.uid()
    )
  );

create policy campaign_recipients_modify on campaign_recipients for all
  using (
    clinic_id in (
      select clinic_id from clinic_members where user_id = auth.uid()
    )
  )
  with check (
    clinic_id in (
      select clinic_id from clinic_members where user_id = auth.uid()
    )
  );

-- conversations
create policy conversations_select on conversations for select
  using (
    clinic_id in (
      select clinic_id from clinic_members where user_id = auth.uid()
    )
  );

create policy conversations_modify on conversations for all
  using (
    clinic_id in (
      select clinic_id from clinic_members where user_id = auth.uid()
    )
  )
  with check (
    clinic_id in (
      select clinic_id from clinic_members where user_id = auth.uid()
    )
  );

-- messages
create policy messages_select on messages for select
  using (
    clinic_id in (
      select clinic_id from clinic_members where user_id = auth.uid()
    )
  );

create policy messages_modify on messages for all
  using (
    clinic_id in (
      select clinic_id from clinic_members where user_id = auth.uid()
    )
  )
  with check (
    clinic_id in (
      select clinic_id from clinic_members where user_id = auth.uid()
    )
  );

-- webhook_events: no user access (service role only)
-- opt_out_events: read-only for clinic members (audit log)
create policy opt_out_events_select on opt_out_events for select
  using (
    clinic_id in (
      select clinic_id from clinic_members where user_id = auth.uid()
    )
  );
