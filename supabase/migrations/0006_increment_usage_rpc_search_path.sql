-- vet-platform-mvp: harden increment_messages_used RPC.
-- Pins search_path to '' to neutralize SQL injection via search_path manipulation
-- (Supabase database linter 0011_function_search_path_mutable, WARN level).
-- Functional behavior is identical to 0005_increment_usage_rpc.sql.

CREATE OR REPLACE FUNCTION public.increment_messages_used(p_clinic_id uuid, p_count int)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  UPDATE public.clinics
  SET messages_used_this_month = messages_used_this_month + p_count
  WHERE id = p_clinic_id;
$$;
