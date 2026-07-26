# BD Action Tracker

After every client meeting you produce a structured summary. But the "Actions and Next Steps" section — with its list of who is doing what, by when, and blocked on what — disappears into a folder and is never seen again.

BD Action Tracker solves this. You paste in a meeting summary (or upload a PDF) and Claude reads through every action item, extracts the structured fields, and adds each one to a living database. From that moment on, you have a single view of every open thread: who owns it (your team or the client's), how long it has been sitting without a touch, whether it has a deadline, what it is blocked on, and what the parallel route is if it stalls.

The dashboard shows you where the bottlenecks are. The timeline makes it visually obvious which accounts have client-side actions piling up. The detail drawer lets you log a nudge, update the status, or note an alternative path — and the "days quiet" counter resets every time you touch a record.

## Tech Stack

- **Next.js 14** (App Router, TypeScript)
- **Tailwind CSS** — utility-first styling
- **Supabase** — Postgres database + file storage
- **Anthropic Claude API** — meeting summary extraction (`claude-sonnet-4-6`)
- **pdf-parse** — server-side PDF text extraction

---

## Quick Start

### 1. Clone and install

```bash
cd proposal-tracker
npm install
```

### 2. Set up environment variables

Copy the example file and fill in your values:

```bash
cp .env.local.example .env.local
```

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard → Project Settings → API → anon public key |
| `SUPABASE_SECRET_KEY` | Supabase dashboard → Project Settings → API Keys → secret key (server only) |
| `SUPABASE_SERVICE_ROLE_KEY` | Legacy alternative to `SUPABASE_SECRET_KEY` (server only) |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com → API Keys |
| `STAKEHOLDER_DUPLICATE_RESOLUTION_ENABLED` | Keep `false` during data validation; set to `true` only after review approval |
| `STAKEHOLDER_APP_URL` | Separate StakeMap deployment embedded in the authenticated stakeholder workspace |
| `STAKEHOLDER_DATA_MODE` | `shared` only when the configured StakeMap deployment uses the shared To-do Tracker Supabase project; otherwise `legacy` |

### 3. Set up Supabase

#### Database

Run the following SQL in the Supabase SQL Editor (Dashboard → SQL Editor):

```sql
-- Create the actions table (stored as `proposals` internally)
CREATE TABLE IF NOT EXISTS proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Core action fields
  title text,
  account_name text,
  contact_name text,
  owner text NOT NULL DEFAULT 'them' CHECK (owner IN ('us', 'them')),
  source_date date,
  expected_by date,
  expected_by_is_approximate boolean NOT NULL DEFAULT false,
  status text DEFAULT 'Open'
    CHECK (status IN ('Open', 'Nudged', 'In Progress', 'Done', 'Stalled', 'Superseded')),
  strategic_weight text
    CHECK (strategic_weight IN ('Low', 'Medium', 'Medium-High', 'High')),
  dependencies text,
  parallel_route text,
  summary text,
  notes text,

  -- Source document
  pdf_url text,
  pdf_filename text,

  -- Hierarchy (parent/child actions)
  parent_id uuid REFERENCES proposals(id) ON DELETE SET NULL
);

-- Keep updated_at current on every row update
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER proposals_updated_at
  BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Enable Row Level Security
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own proposals"
  ON proposals FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own proposals"
  ON proposals FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own proposals"
  ON proposals FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own proposals"
  ON proposals FOR DELETE USING (auth.uid() = user_id);
```

> **Existing ProposalTracker data?** Run migration `003_bd_action_tracker.sql` from `supabase/migrations/` against your existing database to rename columns and update the status enum in place. Back up first.

#### Storage bucket

1. Go to **Storage** in your Supabase dashboard
2. Create a new bucket named **`proposal-pdfs`**
3. Set it to **Public**

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/dashboard`.

---

## Features

### Dashboard (`/dashboard`)

- **KPI cards**: Total Open, Awaiting Client (owner=them, status Open/Nudged), Avg Days Quiet, Overdue
- **Filters**: free-text search, account, owner (us / client), status, strategic weight
- **Days Quiet** colour coding based on `updated_at` (last touch): green < 14d, amber 14–30d, red > 30d
- Click any row to open the detail drawer
- Approximate expected-by dates shown with `~` suffix

### Timeline (`/timeline`)

- Gantt-style bars spanning from the meeting date to the last action (or today for active items)
- **Bars coloured by owner**: indigo = our team, orange = client side — bottlenecks are immediately visible
- **Group by Account** toggle (on by default)
- Expected-by marker: solid orange = exact date, lighter/muted = approximate
- Zoom: 1 month, 3 months, 6 months, 1 year
- Hover tooltip with contact, summary, owner, and dates
- Click any bar or label to open the detail drawer

### Stakeholder workspace (`/dashboard/stakeholders`)

- Keeps StakeMap deployed as a separate application
- Displays its stakeholder register inside the authenticated To-do Tracker shell
- Offers an explicit link to open StakeMap in its own tab
- Uses `STAKEHOLDER_APP_URL` so preview and production deployments can point at
  different StakeMap environments
- Uses `STAKEHOLDER_DATA_MODE` to show whether the embedded deployment reads the
  shared workspace or the original StakeMap database
- Defaults Vercel preview deployments to the Netlify StakeMap deploy preview
  and keeps production on production StakeMap until the cutover is approved
- Does not provide cross-domain single sign-on; StakeMap must use the shared
  Supabase project and authentication before the iframe can become a unified
  secured experience

### Import Flow

1. Click **Import Meeting Summary** to open the modal
2. Choose **PDF Upload** (drag-and-drop) or **Paste Text** (paste your Markdown/plain-text summary directly)
3. Claude extracts every action item from the "Actions and Next Steps" section as separate rows
4. Review and edit each extracted action in the preview — adjust owner, dates, weight, etc.
5. Uncheck any actions you don't want to save
6. Actions are saved to Supabase; PDFs are stored in the `proposal-pdfs` bucket

### Action Drawer

- **Days Quiet** prominently displayed with colour coding — based on `updated_at`, so it resets whenever you edit the record
- **Mark Nudged** quick-action button: sets status to `Nudged` and resets the days counter without opening the full edit form
- Inline-edit: Status, Owner, Expected By (with approximate flag), Strategic Weight, Dependencies, Parallel Route, Notes
- Link to open source document (if uploaded as PDF)
- Delete with confirmation

---

## Project Structure

```
app/
  api/
    upload/         POST — PDF/text parse + Claude extraction
    proposals/      GET (list with filters) + POST (create)
    proposals/[id]/ PATCH (update) + DELETE
  dashboard/        Main BD actions dashboard
  timeline/         Gantt timeline page
  layout.tsx        Root layout with nav + toast provider
components/
  ui/               Button, Input, Select, Textarea, Modal, Badge, Toast
  proposals/        UploadModal (PDF + paste), ProposalDrawer
  NavBar.tsx
lib/
  supabase.ts       Supabase client helpers
  utils.ts          Date formatting, colour helpers
types/
  proposal.ts       TypeScript interfaces (Action, ActionStatus, StrategicWeight, …)
supabase/
  migrations/       001 initial table · 002 parent_id · 003 BD action tracker fields
```

---

## Notes

- `pdf-parse` runs server-side only (listed in `serverComponentsExternalPackages`)
- Authentication via Supabase Auth; RLS restricts every user to their own records
- Sign in with email + password, or use a magic link for passwordless access
- All dates display as `DD MMM YYYY` (e.g. `13 Jun 2026`)
- **Days Quiet** is calculated from `updated_at`, not `created_at` — touching a record (updating any field, including status to `Nudged`) resets the counter
