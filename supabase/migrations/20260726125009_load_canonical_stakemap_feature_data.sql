/*
  Operational data migration.

  The private.legacy_stakemap_feature_batches archive must be populated from
  the legacy StakeMap project before this migration runs. The live migration
  preserved the source UUIDs, translated stakeholder IDs through
  stakeholder_source_aliases, and retained superseded source layouts in the
  private archive.
*/

with target_workspace as (
  select id
  from public.workspaces
  where slug = 'business-development'
),
source_rows as (
  select r.*
  from private.legacy_stakemap_feature_batches b
  cross join lateral jsonb_to_recordset(b.payload) as r(
    id uuid,
    name text,
    created_at timestamptz,
    updated_at timestamptz
  )
  where b.source_project_ref = 'ixoazcoocsncnknyhlce'
    and b.source_table = 'maps'
)
insert into public.maps (
  id,
  workspace_id,
  name,
  created_by,
  created_at,
  updated_at
)
select r.id, w.id, r.name, null, r.created_at, r.updated_at
from source_rows r
cross join target_workspace w
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  name = excluded.name,
  updated_at = excluded.updated_at;

with target_workspace as (
  select id
  from public.workspaces
  where slug = 'business-development'
),
source_rows as (
  select r.*
  from private.legacy_stakemap_feature_batches b
  cross join lateral jsonb_to_recordset(b.payload) as r(
    id uuid,
    from_stakeholder_id uuid,
    to_stakeholder_id uuid,
    relation_type text,
    directionality text,
    strength smallint,
    sentiment_impact smallint,
    confidence smallint,
    last_validated_at date,
    notes text,
    created_at timestamptz,
    updated_at timestamptz
  )
  where b.source_project_ref = 'ixoazcoocsncnknyhlce'
    and b.source_table = 'relationships'
),
canonical_rows as (
  select
    r.id,
    w.id as workspace_id,
    source_alias.canonical_stakeholder_id as from_stakeholder_id,
    target_alias.canonical_stakeholder_id as to_stakeholder_id,
    r.relation_type,
    r.directionality,
    r.strength,
    r.sentiment_impact,
    r.confidence,
    r.last_validated_at,
    r.notes,
    r.created_at,
    r.updated_at
  from source_rows r
  cross join target_workspace w
  join public.stakeholder_source_aliases source_alias
    on source_alias.workspace_id = w.id
   and source_alias.source_stakeholder_id = r.from_stakeholder_id
  join public.stakeholder_source_aliases target_alias
    on target_alias.workspace_id = w.id
   and target_alias.source_stakeholder_id = r.to_stakeholder_id
  where source_alias.canonical_stakeholder_id
    <> target_alias.canonical_stakeholder_id
)
insert into public.relationships (
  id,
  workspace_id,
  from_stakeholder_id,
  to_stakeholder_id,
  relation_type,
  directionality,
  strength,
  sentiment_impact,
  confidence,
  last_validated_at,
  notes,
  created_by,
  created_at,
  updated_at
)
select
  id,
  workspace_id,
  from_stakeholder_id,
  to_stakeholder_id,
  relation_type,
  directionality,
  strength,
  sentiment_impact,
  confidence,
  last_validated_at,
  notes,
  null,
  created_at,
  updated_at
from canonical_rows
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  from_stakeholder_id = excluded.from_stakeholder_id,
  to_stakeholder_id = excluded.to_stakeholder_id,
  relation_type = excluded.relation_type,
  directionality = excluded.directionality,
  strength = excluded.strength,
  sentiment_impact = excluded.sentiment_impact,
  confidence = excluded.confidence,
  last_validated_at = excluded.last_validated_at,
  notes = excluded.notes,
  updated_at = excluded.updated_at;

with target_workspace as (
  select id
  from public.workspaces
  where slug = 'business-development'
),
source_rows as (
  select r.*
  from private.legacy_stakemap_feature_batches b
  cross join lateral jsonb_to_recordset(b.payload) as r(
    id uuid,
    map_id uuid,
    stakeholder_id uuid,
    x double precision,
    y double precision,
    zoom_context double precision,
    saved_by_user_id uuid,
    created_at timestamptz,
    updated_at timestamptz
  )
  where b.source_project_ref = 'ixoazcoocsncnknyhlce'
    and b.source_table = 'map_layouts'
),
canonical_rows as (
  select
    r.id,
    w.id as workspace_id,
    r.map_id,
    a.canonical_stakeholder_id as stakeholder_id,
    r.x,
    r.y,
    r.zoom_context,
    r.created_at,
    r.updated_at,
    row_number() over (
      partition by r.map_id, a.canonical_stakeholder_id
      order by a.is_primary desc nulls last, r.updated_at desc, r.id
    ) as canonical_rank
  from source_rows r
  cross join target_workspace w
  join public.stakeholder_source_aliases a
    on a.workspace_id = w.id
   and a.source_stakeholder_id = r.stakeholder_id
)
insert into public.map_layouts (
  id,
  workspace_id,
  map_id,
  stakeholder_id,
  x,
  y,
  zoom_context,
  saved_by_user_id,
  created_at,
  updated_at
)
select
  id,
  workspace_id,
  map_id,
  stakeholder_id,
  x,
  y,
  zoom_context,
  null,
  created_at,
  updated_at
from canonical_rows
where canonical_rank = 1
on conflict (map_id, stakeholder_id) do update set
  workspace_id = excluded.workspace_id,
  x = excluded.x,
  y = excluded.y,
  zoom_context = excluded.zoom_context,
  updated_at = excluded.updated_at;

with target_workspace as (
  select id
  from public.workspaces
  where slug = 'business-development'
),
source_rows as (
  select r.*
  from private.legacy_stakemap_feature_batches b
  cross join lateral jsonb_to_recordset(b.payload) as r(
    id uuid,
    stakeholder_id uuid,
    interaction_date date,
    channel text,
    summary text,
    outcome text,
    next_action text,
    created_at timestamptz,
    updated_at timestamptz
  )
  where b.source_project_ref = 'ixoazcoocsncnknyhlce'
    and b.source_table = 'interaction_logs'
)
insert into public.interaction_logs (
  id,
  workspace_id,
  stakeholder_id,
  interaction_date,
  channel,
  summary,
  outcome,
  next_action,
  created_by,
  created_at,
  updated_at
)
select
  r.id,
  w.id,
  a.canonical_stakeholder_id,
  r.interaction_date,
  r.channel,
  r.summary,
  r.outcome,
  r.next_action,
  null,
  r.created_at,
  r.updated_at
from source_rows r
cross join target_workspace w
join public.stakeholder_source_aliases a
  on a.workspace_id = w.id
 and a.source_stakeholder_id = r.stakeholder_id
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  stakeholder_id = excluded.stakeholder_id,
  interaction_date = excluded.interaction_date,
  channel = excluded.channel,
  summary = excluded.summary,
  outcome = excluded.outcome,
  next_action = excluded.next_action,
  updated_at = excluded.updated_at;

with target_workspace as (
  select id
  from public.workspaces
  where slug = 'business-development'
),
source_rows as (
  select r.*
  from private.legacy_stakemap_feature_batches b
  cross join lateral jsonb_to_recordset(b.payload) as r(
    id uuid,
    entity_type text,
    entity_id uuid,
    action text,
    diff_json jsonb,
    changed_at timestamptz
  )
  where b.source_project_ref = 'ixoazcoocsncnknyhlce'
    and b.source_table = 'audit_events'
),
canonical_rows as (
  select
    r.id,
    w.id as workspace_id,
    r.entity_type,
    case
      when r.entity_type = 'stakeholder'
        then coalesce(a.canonical_stakeholder_id, r.entity_id)
      else r.entity_id
    end as entity_id,
    r.action,
    r.diff_json,
    r.changed_at
  from source_rows r
  cross join target_workspace w
  left join public.stakeholder_source_aliases a
    on r.entity_type = 'stakeholder'
   and a.workspace_id = w.id
   and a.source_stakeholder_id = r.entity_id
)
insert into public.audit_events (
  id,
  workspace_id,
  entity_type,
  entity_id,
  action,
  diff_json,
  actor_user_id,
  actor_type,
  changed_at
)
select
  id,
  workspace_id,
  entity_type,
  entity_id,
  action,
  diff_json,
  null,
  'legacy_unknown',
  changed_at
from canonical_rows
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  entity_type = excluded.entity_type,
  entity_id = excluded.entity_id,
  action = excluded.action,
  diff_json = excluded.diff_json,
  actor_type = excluded.actor_type,
  changed_at = excluded.changed_at;
