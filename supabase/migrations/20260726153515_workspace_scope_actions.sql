alter table public.proposals
  add column workspace_id uuid,
  add column company_id uuid,
  add column primary_stakeholder_id uuid,
  add column source_interaction_id uuid,
  add column assigned_user_id uuid,
  add column external_owner_stakeholder_id uuid,
  add column created_by uuid,
  add column archived_at timestamptz;

update public.proposals p
set
  workspace_id = w.id,
  created_by = p.user_id
from public.workspaces w
where w.slug = 'business-development';

do $$
begin
  if exists (select 1 from public.proposals where workspace_id is null) then
    raise exception 'Cannot workspace-scope proposals: one or more rows have no target workspace';
  end if;
end
$$;

with company_candidates as (
  select
    p.id as proposal_id,
    (array_agg(c.id order by c.id))[1] as company_id
  from public.proposals p
  join public.companies c
    on c.workspace_id = p.workspace_id
   and c.status = 'active'
   and c.normalized_name = lower(btrim(p.account_name))
  group by p.id
  having count(*) = 1
)
update public.proposals p
set company_id = candidate.company_id
from company_candidates candidate
where candidate.proposal_id = p.id;

with stakeholder_candidates as (
  select
    p.id as proposal_id,
    (array_agg(s.id order by s.id))[1] as stakeholder_id
  from public.proposals p
  join public.stakeholders s
    on s.workspace_id = p.workspace_id
   and s.company_id = p.company_id
   and s.status = 'active'
   and s.normalized_name =
     lower(regexp_replace(btrim(p.contact_name), '\s+', ' ', 'g'))
  group by p.id
  having count(*) = 1
)
update public.proposals p
set primary_stakeholder_id = candidate.stakeholder_id
from stakeholder_candidates candidate
where candidate.proposal_id = p.id;

update public.proposals
set
  assigned_user_id = case when owner = 'us' then user_id end,
  external_owner_stakeholder_id =
    case when owner = 'them' then primary_stakeholder_id end;

alter table public.proposals
  alter column workspace_id set not null,
  alter column user_id set default auth.uid(),
  alter column created_by set default auth.uid();

alter table public.proposals
  drop constraint proposals_user_id_fkey,
  drop constraint proposals_parent_id_fkey;

alter table public.proposals
  add constraint proposals_workspace_fk
    foreign key (workspace_id)
    references public.workspaces(id)
    on delete restrict,
  add constraint proposals_workspace_id_uidx
    unique (workspace_id, id),
  add constraint proposals_company_fk
    foreign key (workspace_id, company_id)
    references public.companies(workspace_id, id)
    on delete restrict,
  add constraint proposals_primary_stakeholder_fk
    foreign key (workspace_id, primary_stakeholder_id)
    references public.stakeholders(workspace_id, id)
    on delete restrict,
  add constraint proposals_external_owner_fk
    foreign key (workspace_id, external_owner_stakeholder_id)
    references public.stakeholders(workspace_id, id)
    on delete restrict,
  add constraint proposals_parent_fk
    foreign key (workspace_id, parent_id)
    references public.proposals(workspace_id, id)
    on delete set null,
  add constraint proposals_user_id_fkey
    foreign key (user_id)
    references auth.users(id)
    on delete set null,
  add constraint proposals_assigned_user_id_fkey
    foreign key (assigned_user_id)
    references auth.users(id)
    on delete set null,
  add constraint proposals_created_by_fkey
    foreign key (created_by)
    references auth.users(id)
    on delete set null;

create index proposals_workspace_updated_idx
  on public.proposals (workspace_id, updated_at desc);
create index proposals_workspace_status_idx
  on public.proposals (workspace_id, status);
create index proposals_workspace_company_idx
  on public.proposals (workspace_id, company_id)
  where company_id is not null;
create index proposals_workspace_stakeholder_idx
  on public.proposals (workspace_id, primary_stakeholder_id)
  where primary_stakeholder_id is not null;
create index proposals_workspace_external_owner_idx
  on public.proposals (workspace_id, external_owner_stakeholder_id)
  where external_owner_stakeholder_id is not null;
create index proposals_workspace_parent_idx
  on public.proposals (workspace_id, parent_id)
  where parent_id is not null;
create index proposals_user_id_idx
  on public.proposals (user_id)
  where user_id is not null;
create index proposals_assigned_user_id_idx
  on public.proposals (assigned_user_id)
  where assigned_user_id is not null;
create index proposals_created_by_idx
  on public.proposals (created_by)
  where created_by is not null;

create table public.action_stakeholders (
  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,
  action_id uuid not null,
  stakeholder_id uuid not null,
  role text not null default 'participant'
    check (role in ('primary', 'responsible', 'participant', 'blocker', 'sponsor')),
  created_at timestamptz not null default now(),
  primary key (action_id, stakeholder_id, role),
  constraint action_stakeholders_action_fk
    foreign key (workspace_id, action_id)
    references public.proposals(workspace_id, id)
    on delete cascade,
  constraint action_stakeholders_stakeholder_fk
    foreign key (workspace_id, stakeholder_id)
    references public.stakeholders(workspace_id, id)
    on delete cascade
);

create index action_stakeholders_workspace_action_idx
  on public.action_stakeholders (workspace_id, action_id);
create index action_stakeholders_workspace_stakeholder_idx
  on public.action_stakeholders (workspace_id, stakeholder_id);

insert into public.action_stakeholders (
  workspace_id,
  action_id,
  stakeholder_id,
  role
)
select
  workspace_id,
  id,
  primary_stakeholder_id,
  'primary'
from public.proposals
where primary_stakeholder_id is not null;

create function private.sync_action_primary_stakeholder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.action_stakeholders
  where action_id = new.id
    and role = 'primary';

  if new.primary_stakeholder_id is not null then
    insert into public.action_stakeholders (
      workspace_id,
      action_id,
      stakeholder_id,
      role
    )
    values (
      new.workspace_id,
      new.id,
      new.primary_stakeholder_id,
      'primary'
    );
  end if;

  return new;
end
$$;

create trigger proposals_sync_primary_stakeholder
after insert or update of workspace_id, primary_stakeholder_id
on public.proposals
for each row execute function private.sync_action_primary_stakeholder();

drop policy "Users access own proposals" on public.proposals;

create policy proposals_select_member on public.proposals
for select to authenticated
using ((select private.can_view_workspace(workspace_id)));

create policy proposals_insert_editor on public.proposals
for insert to authenticated
with check (
  (select private.can_edit_workspace(workspace_id)) and
  created_by = (select auth.uid())
);

create policy proposals_update_editor on public.proposals
for update to authenticated
using ((select private.can_edit_workspace(workspace_id)))
with check ((select private.can_edit_workspace(workspace_id)));

create policy proposals_delete_admin on public.proposals
for delete to authenticated
using ((select private.is_workspace_admin(workspace_id)));

alter table public.action_stakeholders enable row level security;

create policy action_stakeholders_select_member
on public.action_stakeholders
for select to authenticated
using ((select private.can_view_workspace(workspace_id)));

create policy action_stakeholders_insert_editor
on public.action_stakeholders
for insert to authenticated
with check ((select private.can_edit_workspace(workspace_id)));

create policy action_stakeholders_update_editor
on public.action_stakeholders
for update to authenticated
using ((select private.can_edit_workspace(workspace_id)))
with check ((select private.can_edit_workspace(workspace_id)));

create policy action_stakeholders_delete_editor
on public.action_stakeholders
for delete to authenticated
using ((select private.can_edit_workspace(workspace_id)));

revoke all on table public.proposals from anon, authenticated;
grant select, insert, update, delete on table public.proposals to authenticated;
grant all on table public.proposals to service_role;

revoke all on table public.action_stakeholders from anon, authenticated;
grant select, insert, update, delete
  on table public.action_stakeholders
  to authenticated;
grant all on table public.action_stakeholders to service_role;

comment on column public.proposals.workspace_id is
  'Workspace tenant boundary for the action.';
comment on column public.proposals.company_id is
  'Canonical company link; account_name remains the source-text fallback.';
comment on column public.proposals.primary_stakeholder_id is
  'Canonical primary stakeholder link; contact_name remains the source-text fallback.';
comment on column public.proposals.source_interaction_id is
  'Reserved for a future canonical meeting or interaction link.';
comment on column public.proposals.assigned_user_id is
  'Internal workspace user responsible for the action.';
comment on column public.proposals.external_owner_stakeholder_id is
  'Canonical external stakeholder responsible for a client-side action.';
comment on table public.action_stakeholders is
  'Workspace-protected many-to-many stakeholder roles for actions.';
