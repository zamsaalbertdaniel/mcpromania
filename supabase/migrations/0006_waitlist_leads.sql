-- Phase 5 (Waitlist & Lead Capture): Maximum security with zero public read/write.
-- RLS is enabled with NO policies for anon or authenticated.
-- Only trusted server-side code (Next.js API route on Vercel using service_role)
-- can insert via submit_waitlist_lead, and only admins via Supabase Dashboard can read/manage rows.

begin;

create table if not exists public.waitlist_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  company_name text,
  plan_tier text not null default 'pro',
  use_case text,
  status text not null default 'pending',
  source text not null default 'website',
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint waitlist_leads_email_len_check check (char_length(email) between 5 and 254),
  constraint waitlist_leads_email_format_check check (
    email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  ),
  constraint waitlist_leads_full_name_len_check check (char_length(full_name) between 2 and 120),
  constraint waitlist_leads_company_len_check check (
    company_name is null or char_length(company_name) <= 160
  ),
  constraint waitlist_leads_use_case_len_check check (
    use_case is null or char_length(use_case) <= 500
  ),
  constraint waitlist_leads_plan_tier_check check (
    plan_tier in ('free', 'pro', 'agency', 'custom')
  ),
  constraint waitlist_leads_status_check check (
    status in ('pending', 'approved', 'invited', 'rejected')
  ),
  constraint waitlist_leads_source_len_check check (char_length(source) between 1 and 64)
);

-- Case-insensitive unique email index prevents duplicate signups
create unique index if not exists waitlist_leads_email_lower_uidx
  on public.waitlist_leads (lower(email));

create index if not exists waitlist_leads_status_created_idx
  on public.waitlist_leads (status, created_at desc);

alter table public.waitlist_leads enable row level security;

-- Explicit revoke for safety; RLS has zero policies so anon/authenticated have no access.
revoke all on table public.waitlist_leads from public;
revoke all on table public.waitlist_leads from anon;
revoke all on table public.waitlist_leads from authenticated;
grant select, insert, update, delete on table public.waitlist_leads to service_role;

-- Trusted server-side RPC for waitlist submission (service_role only).
-- Returns: { lead_id, already_registered }
create or replace function public.submit_waitlist_lead(
  p_email text,
  p_full_name text,
  p_company_name text default null,
  p_plan_tier text default 'pro',
  p_use_case text default null,
  p_source text default 'website',
  p_ip_hash text default null
)
returns table (
  lead_id uuid,
  already_registered boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_email text;
  v_name text;
  v_company text;
  v_plan text;
  v_use_case text;
  v_source text;
  v_existing_id uuid;
  v_new_id uuid;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  v_name := trim(coalesce(p_full_name, ''));
  v_company := nullif(trim(coalesce(p_company_name, '')), '');
  v_plan := lower(trim(coalesce(p_plan_tier, 'pro')));
  v_use_case := nullif(trim(coalesce(p_use_case, '')), '');
  v_source := coalesce(nullif(trim(coalesce(p_source, '')), ''), 'website');

  if char_length(v_email) < 5 or char_length(v_email) > 254 then
    raise exception 'invalid email length' using errcode = '22023';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'invalid full_name length' using errcode = '22023';
  end if;

  if v_plan not in ('free', 'pro', 'agency', 'custom') then
    raise exception 'invalid plan_tier' using errcode = '22023';
  end if;

  select wl.id
    into v_existing_id
  from public.waitlist_leads as wl
  where lower(wl.email) = v_email
  limit 1;

  if v_existing_id is not null then
    return query select v_existing_id, true;
    return;
  end if;

  insert into public.waitlist_leads (
    email,
    full_name,
    company_name,
    plan_tier,
    use_case,
    source,
    ip_hash
  )
  values (
    v_email,
    v_name,
    v_company,
    v_plan,
    v_use_case,
    v_source,
    nullif(trim(coalesce(p_ip_hash, '')), '')
  )
  on conflict (lower(email)) do nothing
  returning id into v_new_id;

  if v_new_id is null then
    select wl.id
      into v_existing_id
    from public.waitlist_leads as wl
    where lower(wl.email) = v_email
    limit 1;
    return query select v_existing_id, true;
    return;
  end if;

  return query select v_new_id, false;
end;
$$;

revoke all on function public.submit_waitlist_lead(text, text, text, text, text, text, text) from public;
revoke all on function public.submit_waitlist_lead(text, text, text, text, text, text, text) from anon;
revoke all on function public.submit_waitlist_lead(text, text, text, text, text, text, text) from authenticated;
grant execute on function public.submit_waitlist_lead(text, text, text, text, text, text, text) to service_role;

commit;
