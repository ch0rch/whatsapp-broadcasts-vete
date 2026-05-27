-- vet-platform-mvp: performance indexes
-- Partial indexes keep them small (only active/non-null rows).
-- Run after 0001_init.sql

-- Active customers per clinic (segment preview main filter)
create index customers_clinic_active_idx
  on customers (clinic_id, opted_out_at)
  where opted_out_at is null;

-- Non-deleted customers
create index customers_clinic_not_deleted_idx
  on customers (clinic_id)
  where deleted_at is null;

-- Phone number lookup per clinic (agent tool + dedup)
create index customers_phone_idx
  on customers (clinic_id, phone_number);

-- Pets by species for segmentation
create index pets_species_idx
  on pets (clinic_id, species);

-- Pets by vaccine due date (partial: only where set)
create index pets_vaccine_due_idx
  on pets (clinic_id, next_vaccine_due)
  where next_vaccine_due is not null;

-- Pets by last visit date (partial: only where set)
create index pets_last_visit_idx
  on pets (clinic_id, last_visit_date)
  where last_visit_date is not null;

-- Customer → pets join
create index pets_customer_idx
  on pets (customer_id);

-- Campaign recipients by status (polling + webhook updates)
create index campaign_recipients_status_idx
  on campaign_recipients (campaign_id, status);

-- Active handoff conversations (inbox query)
create index conversations_handoff_idx
  on conversations (clinic_id, status)
  where status = 'handoff';

-- Messages chronological per conversation
create index messages_conversation_time_idx
  on messages (conversation_id, timestamp desc);

-- Webhook idempotency lookup (covered by PK but explicit for clarity)
-- webhook_events.id is already PK; no extra index needed.

-- Opt-out audit by customer
create index opt_out_events_customer_idx
  on opt_out_events (clinic_id, customer_id, triggered_at desc);
