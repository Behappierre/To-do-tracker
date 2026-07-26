alter table public.proposals
  add column company_link_status text not null default 'pending',
  add column stakeholder_link_status text not null default 'pending',
  add column link_reviewed_at timestamptz,
  add column link_reviewed_by uuid references auth.users(id) on delete set null;

update public.proposals
set
  company_link_status =
    case when company_id is not null then 'linked' else 'pending' end,
  stakeholder_link_status =
    case when primary_stakeholder_id is not null then 'linked' else 'pending' end;

alter table public.proposals
  add constraint proposals_company_link_status_check
    check (
      (company_id is not null and company_link_status = 'linked') or
      (company_id is null and company_link_status in ('pending', 'no_match'))
    ),
  add constraint proposals_stakeholder_link_status_check
    check (
      (primary_stakeholder_id is not null and stakeholder_link_status = 'linked') or
      (primary_stakeholder_id is null and stakeholder_link_status in ('pending', 'no_match'))
    );

create index proposals_company_link_review_idx
  on public.proposals (workspace_id, company_link_status)
  where company_link_status = 'pending';

create index proposals_stakeholder_link_review_idx
  on public.proposals (workspace_id, stakeholder_link_status)
  where stakeholder_link_status = 'pending';

create index proposals_link_reviewed_by_idx
  on public.proposals (link_reviewed_by)
  where link_reviewed_by is not null;

create function private.track_action_link_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  link_decision_changed boolean;
begin
  if new.company_id is not null then
    new.company_link_status := 'linked';
  elsif new.company_link_status = 'linked' then
    new.company_link_status := 'pending';
  end if;

  if new.primary_stakeholder_id is not null then
    new.stakeholder_link_status := 'linked';
  elsif new.stakeholder_link_status = 'linked' then
    new.stakeholder_link_status := 'pending';
  end if;

  if tg_op = 'INSERT' then
    link_decision_changed :=
      new.company_link_status <> 'pending' or
      new.stakeholder_link_status <> 'pending';
  else
    link_decision_changed :=
      new.company_id is distinct from old.company_id or
      new.primary_stakeholder_id is distinct from old.primary_stakeholder_id or
      new.company_link_status is distinct from old.company_link_status or
      new.stakeholder_link_status is distinct from old.stakeholder_link_status;
  end if;

  if link_decision_changed then
    new.link_reviewed_at := now();
    new.link_reviewed_by := (select auth.uid());
  elsif tg_op = 'UPDATE' then
    new.link_reviewed_at := old.link_reviewed_at;
    new.link_reviewed_by := old.link_reviewed_by;
  end if;

  return new;
end
$$;

create trigger proposals_track_link_review
before insert or update of
  company_id,
  primary_stakeholder_id,
  company_link_status,
  stakeholder_link_status,
  link_reviewed_at,
  link_reviewed_by
on public.proposals
for each row execute function private.track_action_link_review();

comment on column public.proposals.company_link_status is
  'Review state for the canonical company link: pending, linked or intentionally no_match.';
comment on column public.proposals.stakeholder_link_status is
  'Review state for the canonical primary stakeholder link: pending, linked or intentionally no_match.';
