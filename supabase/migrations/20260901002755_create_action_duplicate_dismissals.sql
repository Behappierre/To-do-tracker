create table public.action_duplicate_dismissals (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  action_id_a uuid not null,
  action_id_b uuid not null,
  dismissed_by uuid references auth.users(id) on delete set null,
  dismissed_at timestamptz not null default now(),
  constraint action_duplicate_dismissals_pkey primary key (action_id_a, action_id_b),
  constraint action_duplicate_dismissals_ordered check (action_id_a < action_id_b),
  constraint action_duplicate_dismissals_action_a_fk
    foreign key (workspace_id, action_id_a) references public.proposals (workspace_id, id) on delete cascade,
  constraint action_duplicate_dismissals_action_b_fk
    foreign key (workspace_id, action_id_b) references public.proposals (workspace_id, id) on delete cascade
);

comment on table public.action_duplicate_dismissals is
  'Records that a workspace member reviewed a suggested duplicate action pair and decided it is not a duplicate — suppresses the pair from resurfacing in the duplicate review queue.';

alter table public.action_duplicate_dismissals enable row level security;

create policy action_duplicate_dismissals_select_member
  on public.action_duplicate_dismissals
  for select
  using ((select private.can_view_workspace(action_duplicate_dismissals.workspace_id)));

create policy action_duplicate_dismissals_insert_editor
  on public.action_duplicate_dismissals
  for insert
  with check (
    (select private.can_edit_workspace(action_duplicate_dismissals.workspace_id))
    and dismissed_by = (select auth.uid())
  );

create index action_duplicate_dismissals_workspace_idx
  on public.action_duplicate_dismissals (workspace_id);
