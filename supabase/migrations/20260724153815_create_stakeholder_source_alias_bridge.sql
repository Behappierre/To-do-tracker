create table if not exists public.stakeholder_source_aliases (
  source_stakeholder_id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  canonical_stakeholder_id uuid not null,
  is_primary boolean generated always as (
    source_stakeholder_id = canonical_stakeholder_id
  ) stored,
  created_at timestamptz not null default now(),
  constraint stakeholder_source_aliases_canonical_fk
    foreign key (workspace_id, canonical_stakeholder_id)
    references public.stakeholders(workspace_id, id)
    on delete cascade
);

comment on table public.stakeholder_source_aliases is
  'Workspace-protected ID bridge from legacy StakeMap stakeholders to canonical stakeholders.';

comment on column public.stakeholder_source_aliases.source_stakeholder_id is
  'Original StakeMap stakeholder UUID used by legacy relationships, layouts, interactions, and audit events.';

comment on column public.stakeholder_source_aliases.canonical_stakeholder_id is
  'Canonical stakeholder UUID after duplicate resolution.';

create index if not exists stakeholder_source_aliases_canonical_idx
  on public.stakeholder_source_aliases (workspace_id, canonical_stakeholder_id);

insert into public.stakeholder_source_aliases (
  source_stakeholder_id,
  workspace_id,
  canonical_stakeholder_id
)
select source_id, workspace_id, stakeholder_id
from private.stakeholder_source_mappings
where source_system = 'stakemap'
  and source_entity = 'stakeholders'
  and migration_status = 'migrated'
  and stakeholder_id is not null
on conflict (source_stakeholder_id) do update
set workspace_id = excluded.workspace_id,
    canonical_stakeholder_id = excluded.canonical_stakeholder_id;

alter table public.stakeholder_source_aliases enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'stakeholder_source_aliases'
      and policyname = 'stakeholder_source_aliases_select_member'
  ) then
    create policy stakeholder_source_aliases_select_member
      on public.stakeholder_source_aliases
      for select
      to authenticated
      using (private.can_view_workspace(workspace_id));
  end if;
end;
$$;

revoke all on table public.stakeholder_source_aliases
  from public, anon, authenticated;

grant select on table public.stakeholder_source_aliases to authenticated;
grant select, insert, update, delete
  on table public.stakeholder_source_aliases
  to service_role;
