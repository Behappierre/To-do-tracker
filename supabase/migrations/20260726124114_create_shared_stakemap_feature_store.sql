create table public.maps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null default 'Default Map' check (btrim(name) <> ''),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (workspace_id, id)
);

create table public.relationships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  from_stakeholder_id uuid not null,
  to_stakeholder_id uuid not null,
  relation_type text not null check (relation_type in (
    'REPORTS_TO', 'PEER_OF', 'INFLUENCES', 'COLLABORATES_WITH',
    'ADVISES', 'BLOCKS', 'SPONSORS', 'GATEKEEPER_FOR'
  )),
  directionality text not null default 'directional'
    check (directionality in ('directional', 'bidirectional')),
  strength smallint check (strength is null or strength between 1 and 5),
  sentiment_impact smallint
    check (sentiment_impact is null or sentiment_impact between -1 and 1),
  confidence smallint check (confidence is null or confidence between 1 and 5),
  last_validated_at date,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint relationships_distinct_endpoints
    check (from_stakeholder_id <> to_stakeholder_id),
  constraint relationships_from_stakeholder_fk
    foreign key (workspace_id, from_stakeholder_id)
    references public.stakeholders(workspace_id, id) on delete cascade,
  constraint relationships_to_stakeholder_fk
    foreign key (workspace_id, to_stakeholder_id)
    references public.stakeholders(workspace_id, id) on delete cascade
);

create table public.map_layouts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  map_id uuid not null,
  stakeholder_id uuid not null,
  x double precision not null,
  y double precision not null,
  zoom_context double precision,
  saved_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint map_layouts_map_fk
    foreign key (workspace_id, map_id)
    references public.maps(workspace_id, id) on delete cascade,
  constraint map_layouts_stakeholder_fk
    foreign key (workspace_id, stakeholder_id)
    references public.stakeholders(workspace_id, id) on delete cascade,
  unique (map_id, stakeholder_id)
);

create table public.interaction_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  stakeholder_id uuid not null,
  interaction_date date not null,
  channel text check (
    channel is null or
    channel in ('email', 'call', 'meeting', 'message', 'event', 'other')
  ),
  summary text not null check (btrim(summary) <> ''),
  outcome text,
  next_action text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interaction_logs_stakeholder_fk
    foreign key (workspace_id, stakeholder_id)
    references public.stakeholders(workspace_id, id) on delete cascade
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null check (
    entity_type in ('stakeholder', 'company', 'relationship', 'map', 'interaction')
  ),
  entity_id uuid not null,
  action text not null check (
    action in ('create', 'update', 'archive', 'restore', 'delete')
  ),
  diff_json jsonb,
  actor_user_id uuid references auth.users(id) on delete set null
    default auth.uid(),
  actor_type text not null default 'user'
    check (actor_type in ('user', 'service', 'migration', 'legacy_unknown')),
  changed_at timestamptz not null default now()
);

create index relationships_workspace_from_idx
  on public.relationships (workspace_id, from_stakeholder_id);
create index relationships_workspace_to_idx
  on public.relationships (workspace_id, to_stakeholder_id);
create index relationships_workspace_updated_idx
  on public.relationships (workspace_id, updated_at desc);
create index map_layouts_workspace_map_idx
  on public.map_layouts (workspace_id, map_id);
create index map_layouts_workspace_stakeholder_idx
  on public.map_layouts (workspace_id, stakeholder_id);
create index interaction_logs_workspace_stakeholder_date_idx
  on public.interaction_logs (workspace_id, stakeholder_id, interaction_date desc);
create index audit_events_workspace_changed_idx
  on public.audit_events (workspace_id, changed_at desc);
create index audit_events_workspace_entity_idx
  on public.audit_events (workspace_id, entity_type, entity_id, changed_at desc);

create trigger maps_set_updated_at before update on public.maps
for each row execute function private.set_updated_at();
create trigger relationships_set_updated_at before update on public.relationships
for each row execute function private.set_updated_at();
create trigger map_layouts_set_updated_at before update on public.map_layouts
for each row execute function private.set_updated_at();
create trigger interaction_logs_set_updated_at before update on public.interaction_logs
for each row execute function private.set_updated_at();

alter table public.maps enable row level security;
alter table public.relationships enable row level security;
alter table public.map_layouts enable row level security;
alter table public.interaction_logs enable row level security;
alter table public.audit_events enable row level security;

create policy maps_select_member on public.maps
for select to authenticated
using ((select private.can_view_workspace(workspace_id)));

create policy relationships_select_member on public.relationships
for select to authenticated
using ((select private.can_view_workspace(workspace_id)));
create policy relationships_insert_editor on public.relationships
for insert to authenticated
with check (
  (select private.can_edit_workspace(workspace_id)) and
  created_by = (select auth.uid())
);
create policy relationships_update_editor on public.relationships
for update to authenticated
using ((select private.can_edit_workspace(workspace_id)))
with check ((select private.can_edit_workspace(workspace_id)));
create policy relationships_delete_editor on public.relationships
for delete to authenticated
using ((select private.can_edit_workspace(workspace_id)));

create policy map_layouts_select_member on public.map_layouts
for select to authenticated
using ((select private.can_view_workspace(workspace_id)));
create policy map_layouts_insert_editor on public.map_layouts
for insert to authenticated
with check (
  (select private.can_edit_workspace(workspace_id)) and
  (saved_by_user_id is null or saved_by_user_id = (select auth.uid()))
);
create policy map_layouts_update_editor on public.map_layouts
for update to authenticated
using ((select private.can_edit_workspace(workspace_id)))
with check (
  (select private.can_edit_workspace(workspace_id)) and
  (saved_by_user_id is null or saved_by_user_id = (select auth.uid()))
);
create policy map_layouts_delete_editor on public.map_layouts
for delete to authenticated
using ((select private.can_edit_workspace(workspace_id)));

create policy interaction_logs_select_member on public.interaction_logs
for select to authenticated
using ((select private.can_view_workspace(workspace_id)));
create policy interaction_logs_insert_editor on public.interaction_logs
for insert to authenticated
with check (
  (select private.can_edit_workspace(workspace_id)) and
  created_by = (select auth.uid())
);
create policy interaction_logs_update_editor on public.interaction_logs
for update to authenticated
using ((select private.can_edit_workspace(workspace_id)))
with check ((select private.can_edit_workspace(workspace_id)));
create policy interaction_logs_delete_editor on public.interaction_logs
for delete to authenticated
using ((select private.can_edit_workspace(workspace_id)));

create policy audit_events_select_member on public.audit_events
for select to authenticated
using ((select private.can_view_workspace(workspace_id)));
create policy audit_events_insert_editor on public.audit_events
for insert to authenticated
with check (
  (select private.can_edit_workspace(workspace_id)) and
  actor_user_id = (select auth.uid()) and
  actor_type = 'user'
);

grant select on table public.maps to authenticated;
grant select, insert, update, delete on table public.relationships
  to authenticated;
grant select, insert, update, delete on table public.map_layouts
  to authenticated;
grant select, insert, update, delete on table public.interaction_logs
  to authenticated;
grant select, insert on table public.audit_events to authenticated;

grant all on table
  public.maps,
  public.relationships,
  public.map_layouts,
  public.interaction_logs,
  public.audit_events
to service_role;

revoke all on table
  public.maps,
  public.relationships,
  public.map_layouts,
  public.interaction_logs,
  public.audit_events
from anon;
