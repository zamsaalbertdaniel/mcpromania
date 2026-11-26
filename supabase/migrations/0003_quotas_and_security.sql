-- Monthly quotas and API-key lifecycle fields.
-- IMPORTANT: this migration is safe for the live gateway only when run as a whole.
-- The gateway currently authenticates with the Supabase anon role, so the RPC
-- grants below intentionally preserve EXECUTE for anon.
--
-- Before applying: populate _api_key_plan_map below with every existing api_keys.id
-- and its agreed tier. Never use API tokens or key_hash values in this mapping.
-- This migration aborts before changing the schema if the mapping is incomplete.

begin;

-- Prevent concurrent key creation while validating the mapping. Reads remain available
-- until ALTER TABLE obtains its required stronger lock later in this transaction.
lock table public.api_keys in share row exclusive mode;

create temporary table _api_key_plan_map (
  api_key_id uuid primary key,
  plan_tier text not null check (plan_tier in ('free', 'pro', 'agency', 'custom'))
) on commit drop;

-- Populate mapping for the 3 active keys found in production:
insert into _api_key_plan_map (api_key_id, plan_tier) values
  ('ccfa4bfa-4c28-4a6c-acc2-40c1b8160eab', 'free'),
  ('88c3a426-363d-444a-aac5-7a296e846a3c', 'custom'),
  ('04af8823-ffbd-4fbb-95dc-db9393d6fd36', 'custom');

do $$
declare
  v_existing_count bigint;
  v_mapped_count bigint;
  v_unknown_count bigint;
begin
  select count(*) into v_existing_count from public.api_keys;
  select count(*) into v_mapped_count from _api_key_plan_map;
  select count(*) into v_unknown_count
    from _api_key_plan_map m
    left join public.api_keys k on k.id = m.api_key_id
    where k.id is null;

  if v_existing_count <> v_mapped_count or v_unknown_count <> 0 then
    raise exception
      'Quota migration stopped safely: map every existing api_keys.id to a plan tier (existing %, mapped %, unknown IDs %). No schema changes were committed.',
      v_existing_count, v_mapped_count, v_unknown_count;
  end if;
end;
$$;

alter table public.api_keys
  add column plan_tier text not null default 'free',
  add column monthly_limit integer not null default 100,
  add column is_active boolean not null default true,
  add column revoked_at timestamptz;

update public.api_keys as k
set plan_tier = m.plan_tier,
    monthly_limit = case m.plan_tier
      when 'free' then 100
      when 'pro' then 5000
      when 'agency' then 15000
      when 'custom' then 30000
    end
from _api_key_plan_map as m
where k.id = m.api_key_id;

alter table public.api_keys
  add constraint api_keys_plan_tier_check
    check (plan_tier in ('free', 'pro', 'agency', 'custom')),
  add constraint api_keys_monthly_limit_check
    check (monthly_limit = case plan_tier
      when 'free' then 100
      when 'pro' then 5000
      when 'agency' then 15000
      when 'custom' then 30000
    end);

create index api_keys_active_revoked_idx
  on public.api_keys (is_active, revoked_at);

-- PostgreSQL cannot change a function's TABLE return shape via CREATE OR REPLACE.
-- Drop/recreate inside this transaction, then restore the anon grant before commit.
drop function public.verify_api_key(text);

create function public.verify_api_key(p_key_hash text)
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
set search_path = pg_catalog, public
as $$
  select ak.id, ak.tenant_id, ak.name, ak.plan_tier, ak.monthly_limit
  from public.api_keys as ak
  where p_key_hash is not null
    and length(p_key_hash) > 0
    and ak.key_hash = p_key_hash
    and ak.is_active
    and ak.revoked_at is null
  order by ak.created_at asc
  limit 1;
$$;

revoke all on function public.verify_api_key(text) from public;
revoke all on function public.verify_api_key(text) from anon;
revoke all on function public.verify_api_key(text) from authenticated;
grant execute on function public.verify_api_key(text) to anon;

-- record_usage_log remains available to the live anon-key gateway as in migration 0002.
revoke all on function public.record_usage_log(uuid, uuid, text) from public;
revoke all on function public.record_usage_log(uuid, uuid, text) from anon;
revoke all on function public.record_usage_log(uuid, uuid, text) from authenticated;
grant execute on function public.record_usage_log(uuid, uuid, text) to anon;

commit;
