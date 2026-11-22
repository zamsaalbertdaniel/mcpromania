-- Phase 2: Monthly Quotas & Security Hardening
-- 1. Extend api_keys with plan_tier, monthly_limit, is_active, revoked_at
-- 2. Restrict RPCs: Revoke EXECUTE from anon, grant exclusively to service_role

alter table public.api_keys
  add column if not exists plan_tier text not null default 'free',
  add column if not exists monthly_limit integer not null default 100,
  add column if not exists is_active boolean not null default true,
  add column if not exists revoked_at timestamptz;

create index if not exists api_keys_is_active_idx on public.api_keys (is_active);

-- Update verify_api_key to return plan_tier, monthly_limit and verify active status
create or replace function public.verify_api_key(p_key_hash text)
returns table (
  api_key_id uuid,
  tenant_id uuid,
  key_name text,
  plan_tier text,
  monthly_limit integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ak.id as api_key_id,
    ak.tenant_id,
    ak.name as key_name,
    coalesce(ak.plan_tier, 'free') as plan_tier,
    coalesce(ak.monthly_limit, 100) as monthly_limit
  from public.api_keys as ak
  where p_key_hash is not null
    and length(p_key_hash) > 0
    and ak.key_hash = p_key_hash
    and ak.is_active = true
    and ak.revoked_at is null
  order by ak.created_at asc
  limit 1;
$$;

-- P1 #3 Hardening: Revoke EXECUTE from anon and authenticated, grant ONLY to service_role
revoke all on function public.verify_api_key(text) from public;
revoke all on function public.verify_api_key(text) from anon;
revoke all on function public.verify_api_key(text) from authenticated;
grant execute on function public.verify_api_key(text) to service_role;

revoke all on function public.record_usage_log(uuid, uuid, text) from public;
revoke all on function public.record_usage_log(uuid, uuid, text) from anon;
revoke all on function public.record_usage_log(uuid, uuid, text) from authenticated;
grant execute on function public.record_usage_log(uuid, uuid, text) to service_role;
