-- Add theme column for grouping related action items within an account
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS theme text;
