-- Phase 3 & 4: Persistent key revocation RPC and idempotent usage logging for Edge Function.
-- Safe to apply BEFORE switching the live gateway: keeps existing anon RPCs working
-- until migration 0005 is applied after the gateway rollout completes.

begin;

alter table public.usage_logs
  add column if not exists idempotency_key text;

create unique index if not exists usage_logs_idempotency_key_uidx
  on public.usage_logs (idempotency_key)
  where idempotency_key is not null;

-- Persistent API key revocation (ONLY callable by service_role via private Edge Function).
create or replace function public.revoke_api_key(
  p_api_key_id uuid default null,
  p_key_hash text default null
)
returns table (
  api_key_id uuid,
  key_hash text,
  revoked_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_api_key_id is null and (p_key_hash is null or length(trim(p_key_hash)) = 0) then
    raise exception 'specify api_key_id or key_hash' using errcode = '22023';
  end if;

  return query
  update public.api_keys as ak
  set is_active = false,
      revoked_at = coalesce(ak.revoked_at, now())
  where (p_api_key_id is not null and ak.id = p_api_key_id)
     or (p_key_hash is not null and length(trim(p_key_hash)) > 0 and ak.key_hash = trim(p_key_hash))
  returning ak.id, ak.key_hash, ak.revoked_at;
end;
$$;

revoke all on function public.revoke_api_key(uuid, text) from public;
revoke all on function public.revoke_api_key(uuid, text) from anon;
revoke all on function public.revoke_api_key(uuid, text) from authenticated;
grant execute on function public.revoke_api_key(uuid, text) to service_role;

-- Idempotent usage log writer (ONLY callable by service_role via private Edge Function).
create or replace function public.record_usage_log_idempotent(
  p_tenant_id uuid,
  p_api_key_id uuid,
  p_route text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  if p_tenant_id is null
     or p_api_key_id is null
     or p_route is null
     or length(p_route) = 0
     or p_idempotency_key is null
     or length(trim(p_idempotency_key)) = 0 then
    raise exception 'missing usage log arguments' using errcode = '22023';
  end if;

  if length(p_route) > 512 then
    raise exception 'route is too long' using errcode = '22023';
  end if;

  if length(trim(p_idempotency_key)) > 128 then
    raise exception 'idempotency_key is too long' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.api_keys as ak
    where ak.id = p_api_key_id
      and ak.tenant_id = p_tenant_id
  ) then
    raise exception 'api key does not belong to tenant' using errcode = '42501';
  end if;

  insert into public.usage_logs (tenant_id, api_key_id, route, idempotency_key)
  values (p_tenant_id, p_api_key_id, p_route, trim(p_idempotency_key))
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning id into v_id;

  if v_id is null then
    select ul.id
      into v_id
    from public.usage_logs as ul
    where ul.idempotency_key = trim(p_idempotency_key)
    limit 1;
  end if;

  return v_id;
end;
$$;

revoke all on function public.record_usage_log_idempotent(uuid, uuid, text, text) from public;
revoke all on function public.record_usage_log_idempotent(uuid, uuid, text, text) from anon;
revoke all on function public.record_usage_log_idempotent(uuid, uuid, text, text) from authenticated;
grant execute on function public.record_usage_log_idempotent(uuid, uuid, text, text) to service_role;

commit;
