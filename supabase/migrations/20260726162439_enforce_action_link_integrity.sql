create function private.enforce_action_link_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_company_id uuid;
begin
  if tg_op = 'UPDATE' then
    if new.workspace_id is distinct from old.workspace_id then
      raise exception 'An action cannot be moved between workspaces';
    end if;
    if new.created_by is distinct from old.created_by then
      raise exception 'Action creator is immutable';
    end if;
    if new.user_id is distinct from old.user_id then
      raise exception 'Legacy action owner is immutable';
    end if;
  end if;

  if new.primary_stakeholder_id is not null then
    select s.company_id
      into linked_company_id
    from public.stakeholders s
    where s.workspace_id = new.workspace_id
      and s.id = new.primary_stakeholder_id;

    if not found then
      raise exception 'Primary stakeholder is not in the action workspace';
    end if;

    if new.company_id is null then
      new.company_id := linked_company_id;
    elsif new.company_id is distinct from linked_company_id then
      raise exception 'Primary stakeholder must belong to the linked company';
    end if;
  end if;

  if new.external_owner_stakeholder_id is not null then
    select s.company_id
      into linked_company_id
    from public.stakeholders s
    where s.workspace_id = new.workspace_id
      and s.id = new.external_owner_stakeholder_id;

    if not found or new.company_id is distinct from linked_company_id then
      raise exception 'External owner must belong to the linked company';
    end if;
  end if;

  if new.assigned_user_id is not null and not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = new.workspace_id
      and wm.user_id = new.assigned_user_id
      and wm.status = 'active'
  ) then
    raise exception 'Assigned user must be an active workspace member';
  end if;

  if new.owner = 'us' then
    if new.assigned_user_id is null then
      raise exception 'Internal actions require an assigned workspace member';
    end if;
    new.external_owner_stakeholder_id := null;
  elsif new.owner = 'them' then
    new.assigned_user_id := null;
  end if;

  return new;
end
$$;

create trigger proposals_enforce_link_integrity
before insert or update of
  workspace_id,
  company_id,
  primary_stakeholder_id,
  external_owner_stakeholder_id,
  assigned_user_id,
  owner,
  created_by,
  user_id
on public.proposals
for each row execute function private.enforce_action_link_integrity();
