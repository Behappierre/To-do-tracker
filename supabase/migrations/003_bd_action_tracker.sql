-- BD Action/Dependency Tracker migration
-- Repurposes the proposals table for tracking BD action items from meeting summaries.

-- 1. Rename columns to match the new domain
ALTER TABLE proposals RENAME COLUMN proposal_title TO title;
ALTER TABLE proposals RENAME COLUMN recipient_company TO account_name;
ALTER TABLE proposals RENAME COLUMN recipient_name TO contact_name;
ALTER TABLE proposals RENAME COLUMN proposal_date TO source_date;
ALTER TABLE proposals RENAME COLUMN deadline TO expected_by;

-- 2. Drop the old status check constraint and migrate existing values
ALTER TABLE proposals DROP CONSTRAINT IF EXISTS proposals_status_check;

UPDATE proposals SET status = 'Nudged'      WHERE status = 'Followed Up';
UPDATE proposals SET status = 'In Progress' WHERE status = 'Responded';
UPDATE proposals SET status = 'Done'        WHERE status = 'Closed';

ALTER TABLE proposals
  ADD CONSTRAINT proposals_status_check
  CHECK (status IN ('Open', 'Nudged', 'In Progress', 'Done', 'Stalled', 'Superseded'));

-- 3. Add new columns
ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS owner                    text NOT NULL DEFAULT 'them',
  ADD COLUMN IF NOT EXISTS expected_by_is_approximate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS strategic_weight         text,
  ADD COLUMN IF NOT EXISTS dependencies             text,
  ADD COLUMN IF NOT EXISTS parallel_route           text;

ALTER TABLE proposals
  ADD CONSTRAINT proposals_owner_check
    CHECK (owner IN ('us', 'them')),
  ADD CONSTRAINT proposals_strategic_weight_check
    CHECK (strategic_weight IN ('Low', 'Medium', 'Medium-High', 'High'));

-- 4. Drop old columns that no longer apply
ALTER TABLE proposals DROP COLUMN IF EXISTS sender_name;
ALTER TABLE proposals DROP COLUMN IF EXISTS call_to_action;

-- RLS policy is already in place from migration 001; no changes needed.
