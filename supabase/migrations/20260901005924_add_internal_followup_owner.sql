-- Every action, regardless of owner, must carry a Netcompany-side person
-- responsible for following up on it. assigned_user_id can't serve this
-- purpose: it's deliberately nulled for owner = 'them' actions by
-- private.enforce_action_link_integrity (see 20260726162439_...).

alter table public.proposals
  add column internal_followup_stakeholder_id uuid;

alter table public.proposals
  add constraint proposals_internal_followup_fk
    foreign key (workspace_id, internal_followup_stakeholder_id)
    references public.stakeholders (workspace_id, id);

comment on column public.proposals.internal_followup_stakeholder_id is
  'Netcompany-side person responsible for following up on this action, regardless of owner. Defaults to Harry Kaur unless reassigned.';

-- Backfill existing rows to Harry Kaur, resolved by name under the
-- Netcompany company record rather than a hardcoded id.
update public.proposals p
set internal_followup_stakeholder_id = hk.id
from public.stakeholders hk
join public.companies c
  on c.id = hk.company_id
  and c.workspace_id = hk.workspace_id
where hk.full_name = 'Harry Kaur'
  and c.normalized_name = 'netcompany'
  and hk.workspace_id = p.workspace_id
  and p.internal_followup_stakeholder_id is null;

alter table public.proposals
  alter column internal_followup_stakeholder_id set not null;

create index proposals_internal_followup_idx
  on public.proposals (workspace_id, internal_followup_stakeholder_id);

-- Extend the existing integrity trigger to validate the new column belongs
-- to a stakeholder under the Netcompany company specifically, and to watch
-- it for updates (inserts are always validated regardless of the "of"
-- column list; updates need the column listed to fire at all).
create or replace function private.enforce_action_link_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_company_id uuid;
  internal_company_id uuid;
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

  if new.internal_followup_stakeholder_id is not null then
    select s.company_id
      into internal_company_id
    from public.stakeholders s
    where s.workspace_id = new.workspace_id
      and s.id = new.internal_followup_stakeholder_id;

    if not found then
      raise exception 'Internal follow-up owner is not in the action workspace';
    end if;

    if not exists (
      select 1 from public.companies c
      where c.id = internal_company_id
        and c.workspace_id = new.workspace_id
        and c.normalized_name = 'netcompany'
    ) then
      raise exception 'Internal follow-up owner must belong to the Netcompany company record';
    end if;
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

drop trigger if exists proposals_enforce_link_integrity on public.proposals;
create trigger proposals_enforce_link_integrity
before insert or update of
  workspace_id,
  company_id,
  primary_stakeholder_id,
  external_owner_stakeholder_id,
  assigned_user_id,
  owner,
  created_by,
  user_id,
  internal_followup_stakeholder_id
on public.proposals
for each row execute function private.enforce_action_link_integrity();
