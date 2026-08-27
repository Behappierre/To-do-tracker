# Technical spec: action deduplication & supersession linkage

Status: **proposed, not yet implemented**
Owner: TBD
Related: `app/api/upload/route.ts`, `app/api/proposals/route.ts`, `app/dashboard/page.tsx`, `app/dashboard/action-review/page.tsx`

## Problem

When actions are imported from meeting transcripts/PDFs, actions that have
been superseded by a later thread show up as ongoing duplicates alongside
their replacement, instead of being linked and hidden/nested under it. Users
end up with growing lists of stale, already-resolved actions cluttering the
default dashboard view.

This has two independent root causes, both of which need to be fixed:

1. **No duplicate/supersession detection exists anywhere in the import
   pipeline.** Nothing compares a newly extracted action against actions
   already in the workspace.
2. **Existing linkage data is not honoured by the primary UI.** Even when
   `parent_id` and `status = 'Superseded'` are set correctly, the default
   dashboard view still lists both rows as unrelated peers.

## Current architecture (as-is)

### Data flow

```
PDF / pasted text
  -> app/api/upload/route.ts (POST)
       - parses PDF (pdf-parse) or takes pasted text
       - sends full text to Claude (SYSTEM_PROMPT, lines 4-41) with NO
         knowledge of existing proposals in the workspace
       - model returns { actions: [...] }, status is hardcoded "Open"
  -> components/proposals/UploadModal.tsx
       - shows extracted drafts for review/edit
       - no lookup against existing rows; no duplicate warning
       - each selected draft is POSTed individually
  -> app/api/proposals/route.ts (POST)
       - plain insert into `proposals`, scoped to workspace_id
       - no dedup query, no automatic parent_id/status inference
  -> app/dashboard/page.tsx
       - Grouped view (default): buildGroups() (lines 44-94) buckets ALL
         actions by account_name -> theme and renders every row flat via
         GroupedRow (lines 292-318). No parent/child nesting. Superseded
         rows are not filtered or visually separated beyond the status
         badge.
       - Flat view (opt-in): DOES respect parent_id — builds a childMap
         (lines 202-211) and renders children nested/collapsible under
         their parent (FlatRow, lines 231-289). Supports drag-and-drop to
         set parent_id (handleDrop, lines 213-228).
```

### Existing schema (relevant columns on `proposals`)

- `status text` — CHECK constraint includes `'Superseded'`
  (`supabase/migrations/003_bd_action_tracker.sql`)
- `parent_id uuid REFERENCES proposals(id)` — added in
  `supabase/migrations/002_add_parent_id.sql`, later re-scoped to a
  composite `(workspace_id, id)` FK in
  `20260726153515_workspace_scope_actions.sql`. No uniqueness or cycle
  constraint. Only one level of nesting is supported by the UI (a row that
  already has children cannot itself be assigned a parent).
- `company_link_status` / `stakeholder_link_status` (`pending` / `linked` /
  `no_match`) — added in `20260726162640_add_action_link_review_status.sql`,
  enforced by a trigger (`private.track_action_link_review`). This is a
  **precedent pattern** for a review-queue-driven linking workflow, but it
  only covers linking an action's free-text company/contact to canonical
  `companies`/`stakeholders` records — it does not compare actions to each
  other.

### Existing duplicate-detection precedent (not reused for actions today)

`app/dashboard/action-review/page.tsx` implements fuzzy matching for
company/stakeholder linking:

- `normalize()` — lowercases, strips punctuation, collapses whitespace
- `similarity()` — exact match = 1.0, substring containment = 0.88,
  otherwise Jaccard token overlap
- `bestSuggestion()` — picks the highest-scoring candidate above a minimum
  threshold (0.34 default)
- Renders a "Suggested: X · NN% — use this" affordance; nothing is applied
  automatically, the user must click to accept

This is the pattern the new work should reuse rather than reinvent.

## Proposed solution

### Part A — Fix the Grouped view to honour existing linkage (independent, ship first)

This requires no new detection logic and fixes the symptom for any action
that is already correctly linked/marked today.

- Extend `buildGroups()` in `app/dashboard/page.tsx` to build a
  `childMap`/`roots` structure per theme group, the same way Flat view
  already does (reuse logic from lines 202-211).
- `GroupedRow` gains an `isChild` prop and the same indentation/expand
  affordance as `FlatRow`.
- Superseded rows with a linked parent render nested and collapsed by
  default under their parent, not as flat peers.
- Superseded rows with **no** parent (orphaned) still show, but with a
  distinct visual treatment (e.g. muted/strikethrough) so they're
  recognisable as historical rather than actionable, and a prompt to link
  them (see Part C).
- Add a view toggle or persistent filter default of hiding `Superseded`
  rows entirely from Grouped view unless "Show superseded" is explicitly
  enabled (mirrors how `archived_at IS NOT NULL` rows are already excluded
  server-side in `GET /api/proposals`).

Acceptance criteria:
- A row with `status = 'Superseded'` and a valid `parent_id` never appears
  as a top-level peer of its parent in Grouped view.
- Toggling "Show superseded" reveals them nested/collapsed.

### Part B — Duplicate/supersession detection at import time

Goal: when new actions are extracted from a document, flag likely matches
against existing open actions in the same workspace, and let the user
resolve them in the same review step where they already edit drafts —
never auto-merge or auto-supersede without confirmation.

#### B1. New matching endpoint

`GET /api/proposals/candidates?account_name=&title=&summary=&exclude_status=Done,Superseded`

Or, simpler and avoiding N new round-trips: extend
`components/proposals/UploadModal.tsx` to fetch **all open actions for the
workspace** once (already effectively available via `GET /api/proposals`
filtered client-side) and run matching in the browser, exactly as
`action-review/page.tsx` already does for companies/stakeholders. This
avoids a new endpoint and keeps the logic consistent/reusable.

Extract the `normalize()`/`similarity()`/`bestSuggestion()` helpers out of
`app/dashboard/action-review/page.tsx` into a shared module, e.g.
`lib/similarity.ts`, so both the action-review queue and the new
import-time matcher use the same implementation.

#### B2. Matching signal

For each extracted draft, compute a match score against existing actions
scoped to the same `account_name` (or `company_id` once linked) where
`status` is not `Done`/`Superseded`:

- Primary signal: `similarity(draft.title, existing.title)`
- Secondary signal (tie-break / boost): token overlap between
  `draft.summary` and `existing.summary`
- Combine as e.g. `score = 0.7 * titleScore + 0.3 * summaryScore`
- Surface the single best match above a minimum threshold (start at 0.5;
  tune after real usage — action titles are noisier than company names, so
  the company/stakeholder threshold of 0.34 is likely too low here and
  would over-trigger)

This is a heuristic v1. It is explicitly *not* a semantic/LLM-based
comparison — see "Alternatives considered" below for why that's deferred.

#### B3. UI in `UploadModal.tsx`

For each draft row in the preview stage that has a candidate match:

- Show an inline banner under the draft: "Possible match: *{existing
  title}* ({score}%) — opened {days} days ago"
- Three explicit choices (no default/auto-applied action):
  - **Save as new** (current behaviour, default/no-op)
  - **This supersedes it** — on save, sets the new row's `parent_id` to the
    matched row's id, and issues a follow-up PATCH to the matched row
    setting `status = 'Superseded'`
  - **Not a match** — dismisses the suggestion for this draft (no schema
    change needed; purely a client-side dismissal for this session)

#### B4. Save-path changes

`handleSave()` in `UploadModal.tsx` currently POSTs each draft
independently. When "This supersedes it" is chosen for a draft:

1. POST the new draft as today, including `parent_id` in the body (already
   accepted by `POST /api/proposals`, just never populated by this flow
   currently).
2. PATCH the matched existing row: `{ status: 'Superseded' }`.

Both of these already work today via existing endpoints — no backend
schema or endpoint changes are required for the linking to be *created*,
only for it to be *surfaced and easy to apply*.

### Part C — Standing review queue for already-imported duplicates

For the backlog of actions imported before this fix (like the ~250 rows
currently in the workspace), Part B only prevents new duplicates going
forward. To help clean up existing ones:

- Add a new tab/section, e.g. `app/dashboard/action-review/duplicates`,
  modeled directly on the existing `action-review` queue.
- For every pair of open actions in the same account with
  `similarity(title) > threshold`, list them side by side with the same
  three choices as B3 (supersede / keep both / dismiss).
- Persist "dismissed" decisions so the same pair doesn't resurface. This
  needs a small new table, e.g.:

```sql
create table public.action_duplicate_dismissals (
  workspace_id uuid not null references public.workspaces(id),
  action_id_a uuid not null references public.proposals(id) on delete cascade,
  action_id_b uuid not null references public.proposals(id) on delete cascade,
  dismissed_by uuid references auth.users(id) on delete set null,
  dismissed_at timestamptz not null default now(),
  primary key (action_id_a, action_id_b)
);
```

(Store the pair with a canonical ordering, e.g. `action_id_a <
action_id_b`, to avoid duplicate rows for the same pair in either order.)

This part is lower priority than A and B — it's a backfill/cleanup tool,
not a fix to the ongoing import flow — and can ship later.

## Non-goals / explicitly out of scope for this spec

- Automatic merging or auto-superseding without a human clicking to
  confirm. Every existing review-queue pattern in this codebase
  (stakeholder duplicates, action link review) requires explicit
  human confirmation, and this should follow the same principle — false
  positives that silently close a live action are worse than a missed
  duplicate.
- Multi-level parent/child nesting. The current one-level restriction
  (`ProposalDrawer.tsx` line 81-82, `handleDrop` line 216) is left as-is.
- Cross-workspace matching. Matching is scoped to the current workspace
  only, consistent with existing RLS/workspace-scoping.

## Alternatives considered

**LLM-assisted duplicate detection at extraction time** (passing a list of
current open action titles/summaries into the `SYSTEM_PROMPT` in
`app/api/upload/route.ts` and asking Claude to flag supersession directly,
similar to how the CSV export shows the model referencing other actions by
an ephemeral `idx` within a single extraction batch) was considered and
rejected for v1:

- Higher latency/cost per import (larger prompt, scales with number of
  open actions in the workspace over time).
- The model's `idx`-style references observed in historical data point at
  positions *within the same extraction batch*, not stable database IDs —
  making them useless for cross-import linking without a separate
  resolution step anyway.
- It still requires the same human-confirmation UI as the heuristic
  approach, so it adds cost without removing the need for Part B3.

It may be worth revisiting once the heuristic approach's false-positive/
false-negative rate is measured against real usage — if title/summary
text-similarity proves too noisy, a lightweight embedding-similarity
re-ranker (still surfaced through the same confirm-first UI) is the next
step up before reaching for a full LLM call per import.

## Rollout plan

1. Ship Part A alone first — pure UI fix, no schema/API changes, low risk,
   immediately improves what's visible today for any action already
   linked/marked.
2. Ship Part B — extract shared `lib/similarity.ts`, wire up the
   import-preview matching UI and the two-request save path. No schema
   changes required.
3. Ship Part C if the backlog of historical duplicates is still a problem
   after B ships (new table + review queue page).

## Open questions for whoever picks this up

- What similarity threshold and title/summary weighting actually works
  well against this workspace's real data? Needs tuning against a sample
  once B1/B2 are wired up — the 0.5 starting point above is a guess.
- Should "This supersedes it" also copy `notes`/`dependencies` context from
  the old action into the new one's `summary`, so context isn't lost when
  the old row gets collapsed out of view?
- Should archived (`archived_at is not null`) actions be excluded from
  matching candidates, or included since they might still be a valid
  supersession target? (Current recommendation: exclude, consistent with
  `GET /api/proposals` already filtering them out by default.)
