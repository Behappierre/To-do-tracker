/*
  Harden internal lineage and archive data even though the private schema is
  not currently exposed through the Data API.

  Runtime duplicate resolution continues through the postgres-owned
  security-definer function public.resolve_stakeholder_duplicate_group().
  Direct client and service-role access to the underlying private tables is
  intentionally removed.
*/

revoke all on schema private from public, anon, authenticated, service_role;

revoke all on table
  private.company_source_mappings,
  private.stakeholder_duplicate_groups,
  private.stakeholder_source_mappings,
  private.legacy_stakemap_feature_batches
from public, anon, authenticated, service_role;

alter table private.company_source_mappings enable row level security;
alter table private.stakeholder_duplicate_groups enable row level security;
alter table private.stakeholder_source_mappings enable row level security;
alter table private.legacy_stakemap_feature_batches enable row level security;

/*
  public."Stakeholders" is the immutable 190-row source import. Canonical
  application reads use public.stakeholders (lowercase), so no client role
  should access this source table directly.
*/

alter table public."Stakeholders"
  alter column id set not null;

alter table public."Stakeholders"
  add constraint legacy_stakeholders_pkey primary key (id);

revoke all on table public."Stakeholders"
from public, anon, authenticated, service_role;

grant select on table public."Stakeholders" to service_role;

create policy legacy_stakeholders_no_client_access
on public."Stakeholders"
for all
to anon, authenticated
using (false)
with check (false);

comment on table public."Stakeholders" is
  'Immutable imported StakeMap source rows. Client access is denied; use public.stakeholders for canonical application data.';
