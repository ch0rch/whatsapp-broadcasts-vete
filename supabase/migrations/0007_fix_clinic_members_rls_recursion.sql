-- Fixes infinite recursion in clinic_members RLS:
-- the original policy used `clinic_id in (select clinic_id from clinic_members ...)`,
-- which makes Postgres evaluate the same policy while evaluating the same policy.
-- Symptom (PR-MVP): /api/crm/customers (and any UI route reading via the scoped
-- client) returned 500 with "infinite recursion detected in policy for relation
-- \"clinic_members\"".
--
-- The vet UI only needs each user to see their own memberships; cross-clinic
-- visibility of other members is never exercised today, and any future need
-- would be served by an explicit admin-scoped query, not by RLS.

drop policy if exists clinic_members_select on clinic_members;

create policy clinic_members_select on clinic_members for select
  using (user_id = auth.uid());
