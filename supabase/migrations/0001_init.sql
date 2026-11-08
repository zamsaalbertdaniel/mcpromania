-- Phase 0: tenants, api keys, usage logs.
-- Admin Client (service_role) se folosește doar în workers.
-- Gateway-ul folosește întotdeauna client scoped pe tenant_id.
-- service_role ocolește RLS. Rolurile anon și authenticated nu primesc politici aici.

create extension if not exists pgcrypto;

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  key_hash text not null,
  created_at timestamptz not null default now()
);

create table public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  api_key_id uuid not null references public.api_keys (id) on delete cascade,
  route text not null,
  created_at timestamptz not null default now()
);

create index api_keys_tenant_id_idx on public.api_keys (tenant_id);
create index usage_logs_tenant_id_idx on public.usage_logs (tenant_id);

alter table public.tenants enable row level security;
alter table public.api_keys enable row level security;
alter table public.usage_logs enable row level security;

-- RLS: fără politici pentru anon/authenticated, accesul implicit este refuzat.
-- Gateway-ul trebuie să deschidă un client filtrat pe tenant_id.
-- Workers folosesc service_role doar pentru joburi care trec peste RLS.
