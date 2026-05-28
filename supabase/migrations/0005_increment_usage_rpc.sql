-- vet-platform-mvp: atomic increment RPC for monthly usage counter
-- Closes PR-3 verify-report W-2 (race condition in incrementClinicUsage).
--
-- Once this migration is applied, the existing repo.ts call to
--   admin.rpc('increment_messages_used', { p_clinic_id, p_count })
-- succeeds atomically and the read+write fallback is never triggered.

CREATE OR REPLACE FUNCTION increment_messages_used(p_clinic_id uuid, p_count int)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE clinics
  SET messages_used_this_month = messages_used_this_month + p_count
  WHERE id = p_clinic_id;
$$;
