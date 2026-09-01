# Technical spec: context-aware extraction, UI simplification, mandatory internal ownership

Status: **proposed, not yet implemented**
Related: `app/api/upload/route.ts`, `app/dashboard/page.tsx`, `components/proposals/ProposalDrawer.tsx`,
`components/proposals/UploadModal.tsx`, `supabase/migrations/`

This spec covers three related but independently shippable changes, in the
order they should land:

- **Part D** — feed existing workspace data into the extraction prompt so
  the model links companies/stakeholders and flags likely continuations at
  import time, instead of extracting blind from raw text.
- **Part E** — cut the number of fields shown by default across the
  dashboard, drawer, and upload preview, based on an actual inventory of
  what's on screen today (below).
- **Part F** — every action, including client-owned ones, must carry a
  Netcompany-side person responsible for chasing it, defaulting to Harry
  Kaur unless overridden.

None of these depend on the OpenRouter/model-provider question raised
earlier — the extra context in Part D is a few KB, trivial on any model
including the current `claude-sonnet-4-6`.

---

## Part D — Context-aware extraction

### Problem

`app/api/upload/route.ts` extracts every action from a raw document with
zero knowledge of the workspace it's extracting into: it can't resolve
"Alistair Rutter" to a canonical stakeholder, can't reuse an existing theme
name instead of inventing a slightly different one, and can't notice that
an extracted action clearly continues one already open. All of that gets
left for manual review after the fact (`company_link_status`/
`stakeholder_link_status = pending`, free-text `theme`, no continuation
hint at all).

### Design

Before calling the extraction model, fetch a small **context bundle**:

1. Companies + stakeholders whose name has a substring match against the
   raw input text (reuse `/api/entity-options`, filter client-side or via
   a query — keep this bounded, not the whole workspace).
2. The distinct `theme` values already in use in the workspace.
3. Open actions (`status` not in `Done`/`Superseded`) for those same
   matched companies, title + id only — just enough for the model to
   recognise a continuation, not full summaries.

Include this bundle as a structured block in the prompt (after the
existing instructions), with explicit rules:

- Resolve a mentioned person/company to a canonical id **only when
  confident**; leave `company_id`/`primary_stakeholder_id` null otherwise
  (today's `pending`-review fallback still applies).
- Reuse an existing theme name when the topic clearly matches one; only
  propose a new theme when none fits.
- If an extracted action is clearly a continuation of one of the open
  actions listed, set a new `possible_continuation_of` field to that
  action's id — but **always still extract it as a new action row**, never
  skip extraction because a similar one exists. Deciding what happens to
  the old one is Part B/C's job, not the extraction step's.

### Required validation (non-negotiable)

Every id the model returns (`company_id`, `primary_stakeholder_id`,
`possible_continuation_of`) **must be checked server-side against the
context bundle actually sent**, before it's trusted. A hallucinated id
that happens to look like a UUID is a real failure mode here — silently
drop/null any id that doesn't match something in the bundle, don't pass it
through.

### How this composes with Part B/C

`possible_continuation_of` becomes a second signal alongside Part B's
deterministic fuzzy match, surfaced in the same duplicate-match banner in
`UploadModal.tsx` already built for Part B. Suggested behaviour: if both
signals agree on the same target action, pre-select "This supersedes it"
in the banner instead of defaulting to "Save as new" — still one click to
change, never applied without the user seeing it. If they disagree, show
both and let the user decide; don't silently prefer one.

### Scope note

This is materially more work than Parts A–C: new retrieval logic, a
redesigned prompt, new response fields threaded through `ExtractedAction`
and `UploadModal`, and the id-validation step above. Treat it as its own
implementation pass, not a quick addition to the existing upload route.

---

## Part E — UI simplification

### Current inventory (as of this session, before any changes)

**Dashboard table (Grouped and Flat views)** — `app/dashboard/page.tsx`:
Title, Contact, Account (Flat only), Owner, Meeting Date (`source_date`),
Days Quiet, Expected By, Status. 7 columns in Grouped view, 8 in Flat.

**Action drawer** (`ProposalDrawer.tsx`) — everything above, plus: Days
Live banner, Context/Summary, Dependencies (read-only display), StakeMap
company/stakeholder link pickers, Status, Owner, Expected By + "is
approximate" checkbox, Strategic Weight, Dependencies (editable textarea —
yes, both a display and an edit copy today), Parallel Route, Notes, Parent
Action picker, PDF link. **14 distinct fields/controls** on one screen,
all shown at once, no grouping.

**Upload preview** (`UploadModal.tsx`, per draft when expanded): Title,
Linked Company, Linked Stakeholder, Account, Contact Name, Owner, Meeting
Date, Expected By, Strategic Weight, Status, "approximate" checkbox,
Dependencies, Context/Summary, Notes. **13 fields per action**, reviewed
one at a time for every extracted action in an import batch — a 10-action
import means scrolling through 130 field instances if you expand each one.

This matches what you flagged: there's a lot of surface area, and not all
of it is used on every action.

### Proposed simplification

**Dashboard table** — reduce to what's actually needed for triage and
sorting: **Title, Responsible (Part F, new), Owner, Days Quiet, Expected
By, Status**, plus Account in Flat view only (Grouped already groups by
account, so repeating it in a column is redundant there). Drop **Meeting
Date** from the always-visible columns — it's when the ask originated, not
where it stands today; move it into the drawer only. That's 6 columns
instead of 7–8, and every one of them is either sortable-and-actionable
(Days Quiet, Expected By, Status) or identity (Title, Responsible, Owner).

**Drawer** — split into two visual tiers instead of one flat list:
- **At a glance** (always visible): Status, Owner, Responsible (Part F),
  Expected By, Company/Stakeholder links, Parent Action, Days Live banner.
- **More details** (collapsed by default, one click to expand): Meeting
  Date, Strategic Weight, Dependencies, Parallel Route, Notes,
  "expected by is approximate" checkbox, PDF link.

This mirrors a pattern already in this codebase — `UploadModal.tsx`
already collapses each draft behind an expand chevron; the drawer just
needs the same idea applied *within* one action instead of only between
actions.

**Upload preview** — same treatment: keep **Title, Company, Stakeholder,
Owner, Expected By, Status, Responsible (Part F)** inline in the expanded
card (the fields you're most likely to correct before saving), and move
**Strategic Weight, Dependencies, Parallel Route, Notes, the approximate
checkbox** behind a per-draft "Show more fields" toggle, collapsed by
default.

### Explicitly not touched

The duplicate-match banner from Part B and the collapsible parent/child
rows from Part A stay as-is — they're new, not part of the clutter being
described here, and already follow the progressive-disclosure pattern this
part is trying to apply everywhere else.

### Open question

Should "More details" / "Show more fields" remember its expanded state
per user (e.g. in `localStorage`), or always start collapsed? Recommend
always-collapsed to start — simplest, and matches the goal of a quieter
default view.

---

## Part F — Mandatory internal responsible person

### Requirement

Every action — **including client-owned ones** (`owner = 'them'`) — must
have a Netcompany-side person recorded as responsible for following up on
it. Default: **Harry Kaur**, unless a reason exists to assign someone
else.

### Why this doesn't fit the existing schema

`proposals.assigned_user_id` looks like the obvious field, but it isn't:
the existing trigger `private.enforce_action_link_integrity`
(`supabase/migrations/20260726162439_enforce_action_link_integrity.sql`)
explicitly **nulls `assigned_user_id` whenever `owner = 'them'`**:

```sql
elsif new.owner = 'them' then
  new.assigned_user_id := null;
```

`assigned_user_id` means "the internal user actually doing the work," and
that's correctly null when the client owns the task. What's being asked
for here is a different concept — "who at Netcompany is chasing the
client for movement on their task" — which needs to exist **regardless**
of `owner`. Reusing `assigned_user_id` would either break that existing
semantic or require ripping out the trigger rule above; cleaner to add a
distinct column.

### Prerequisite: Harry Kaur doesn't exist as a record yet

Checked the live workspace before writing this: there is exactly **one**
real system user (`olivier@andre.org.uk`, workspace admin), and no
`stakeholders` row for anyone named Harry — he only ever appears as loose
`contact_name` text on a couple of Hitachi Rail actions. He is not a
login user of this app, and doesn't need to be one for this feature: there
is already a canonical **"Netcompany" row in `public.companies`**
(`fa406d95-74a3-4b55-8f2c-7ebe3deda3f7`), which is exactly where internal
team members belong in this data model — the same way client-side contacts
are `stakeholders` rows under their own company, `external_owner_stakeholder_id`
already points at one.

**Before this can be wired up, someone needs to create a `stakeholders`
row for Harry Kaur under the Netcompany company** (full name at minimum;
email/title optional). I haven't done this — creating a new person record
is a real data decision, not a schema one, and should come from you rather
than me guessing at his details.

### Schema change

```sql
alter table public.proposals
  add column internal_followup_stakeholder_id uuid;

alter table public.proposals
  add constraint proposals_internal_followup_fk
    foreign key (workspace_id, internal_followup_stakeholder_id)
    references public.stakeholders (workspace_id, id);
```

Added nullable first (existing ~250 rows need a value before a `not null`
constraint is safe), then, once Harry Kaur's stakeholder row exists:

```sql
update public.proposals
set internal_followup_stakeholder_id = '<harry-kaurs-stakeholder-id>'
where internal_followup_stakeholder_id is null;

alter table public.proposals
  alter column internal_followup_stakeholder_id set not null;
```

matching exactly the pattern already used for
`company_link_status`/`stakeholder_link_status` in
`20260726162640_add_action_link_review_status.sql` (add, backfill, then
constrain).

### Where the default gets applied

Two places, both defaulting to Harry Kaur's stakeholder id when nothing
else is specified:

- **`POST /api/proposals`** and the extraction step (Part D or the current
  flow) — if the incoming action doesn't specify
  `internal_followup_stakeholder_id`, set it to Harry Kaur's id before
  insert.
- **`UploadModal.tsx`** — pre-select Harry Kaur in the field's picker for
  every draft, same as `owner` already defaults to `'them'` in
  `emptyDraft()`. The reviewer overrides it inline exactly like any other
  field, same one-click pattern as everything else in this UI.

### Open question

Should reassigning this field away from Harry Kaur require a reason/note
(matching "unless there is a reason to assign somebody else" from the
request literally), or is silently picking a different person from the
list sufficient, with the reason implicit in whatever notes the reviewer
already leaves? Recommend the latter — a mandatory reason field adds
friction to what should be a quick one-click override, and this app
doesn't require justification for any other manual override today (e.g.
overriding owner, strategic weight).

---

## Suggested order

1. **Part F schema** — smallest, and Part E's "Responsible" column and
   Part D's default-assignment logic both depend on the field existing.
   Blocked on you creating Harry Kaur's stakeholder record first.
2. **Part E** — pure UI, no dependencies once Part F's column exists to
   put in the new column slot.
3. **Part D** — largest, most valuable once the other two are stable
   underneath it (a quieter UI makes the new continuation-hint signal
   easier to actually notice; the responsible-person default should be
   applied by the same extraction step handling everything else).
