create table private.legacy_stakemap_feature_batches (
  source_project_ref text not null,
  source_table text not null,
  batch_offset integer not null check (batch_offset >= 0),
  captured_at timestamptz not null default now(),
  payload jsonb not null check (jsonb_typeof(payload) = 'array'),
  primary key (source_project_ref, source_table, batch_offset)
);

revoke all on table private.legacy_stakemap_feature_batches
  from public, anon, authenticated;
grant select, insert, update, delete
  on table private.legacy_stakemap_feature_batches
  to service_role;
