-- Phase 1: gateway RPC scoped on the anon key.
-- Admin Client (service_role) se folosește doar în workers.
-- Gateway-ul folosește întotdeauna client scoped pe tenant_id.
-- RLS stays enabled with no anon policies. These SECURITY DEFINER functions are the
-- only gateway entry points: they bypass RLS as the function owner and enforce the
-- tenant/api-key pair themselves. EXECUTE is granted only to anon.

create index if not exists api_keys_key_hash_idx on public.api_keys (key_hash);

create or replace function public.verify_api_key(p_key_hash text)
returns table (api_key_id uuid, tenant_id uuid, key_name text)
language sql
stable
security definer
set search_path = public
as $$
  select ak.id as api_key_id, ak.tenant_id, ak.name as key_name
  from public.api_keys as ak
  where p_key_hash is not null
    and length(p_key_hash) > 0
    and ak.key_hash = p_key_hash
  order by ak.created_at asc
  limit 1;
$$;

create or replace function public.record_usage_log(
  p_tenant_id uuid,
  p_api_key_id uuid,
  p_route text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_tenant_id is null or p_api_key_id is null or p_route is null or length(p_route) = 0 then
    raise exception 'missing usage log arguments' using errcode = '22023';
  end if;

  if length(p_route) > 512 then
    raise exception 'route is too long' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.api_keys as ak
    where ak.id = p_api_key_id
      and ak.tenant_id = p_tenant_id
  ) then
    raise exception 'api key does not belong to tenant' using errcode = '42501';
  end if;

  insert into public.usage_logs (tenant_id, api_key_id, route)
  values (p_tenant_id, p_api_key_id, p_route)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.verify_api_key(text) from public;
revoke all on function public.verify_api_key(text) from anon;
revoke all on function public.verify_api_key(text) from authenticated;
grant execute on function public.verify_api_key(text) to anon;

revoke all on function public.record_usage_log(uuid, uuid, text) from public;
revoke all on function public.record_usage_log(uuid, uuid, text) from anon;
revoke all on function public.record_usage_log(uuid, uuid, text) from authenticated;
grant execute on function public.record_usage_log(uuid, uuid, text) to anon;
