create index maps_created_by_idx on public.maps (created_by);
create index relationships_created_by_idx on public.relationships (created_by);
create index map_layouts_saved_by_user_idx
  on public.map_layouts (saved_by_user_id);
create index interaction_logs_created_by_idx
  on public.interaction_logs (created_by);
create index audit_events_actor_user_idx
  on public.audit_events (actor_user_id);
