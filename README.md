# ProposalTracker

Sending proposals is the easy part. Knowing what happened to them is not.

ProposalTracker is an AI-powered pipeline for managing your outbound business development. You upload a PDF — a single proposal or an entire export of sent emails — and Claude reads through every message, extracts the key information, and adds each proposal to a structured database. From that moment on, you have a living record: who you contacted, what you proposed, when you sent it, whether there is a deadline, and exactly how long it has been sitting without a response.

The dashboard gives you an at-a-glance view of your pipeline. Which proposals are still open? Which ones have been followed up? How many are past their deadline? The timeline view maps every proposal onto a Gantt-style chart so you can see at a glance how your outreach effort is distributed over time — which clients have been waiting the longest, where activity has been concentrated, and what is coming up. Clicking any bar or row opens a detail panel where you can update the status, record notes, adjust the deadline, or pull up the original PDF.

The goal is simple: no more lost proposals, no more "when did I send that?", and no more following up too late.

## Tech Stack

- **Next.js 14** (App Router, TypeScript)
- **Tailwind CSS** — utility-first styling
- **Supabase** — Postgres database + file storage
- **Anthropic Claude API** — PDF intelligence extraction (`claude-sonnet-4-20250514`)
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
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Project Settings → API → service_role key |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com → API Keys |

### 3. Set up Supabase

#### Database

Run the following SQL in the Supabase SQL Editor (Dashboard → SQL Editor):

```sql
-- Create the proposals table
CREATE TABLE IF NOT EXISTS proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  proposal_title text,
  sender_name text,
  recipient_name text,
  recipient_company text,
  proposal_date date,
  summary text,
  call_to_action text,
  deadline date,
  status text DEFAULT 'Open' CHECK (status IN ('Open', 'Followed Up', 'Responded', 'Closed', 'Stalled')),
  notes text,
  pdf_url text,
  pdf_filename text
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

-- Each user can only see and manage their own proposals
CREATE POLICY "Users can view own proposals"
  ON proposals FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own proposals"
  ON proposals FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own proposals"
  ON proposals FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own proposals"
  ON proposals FOR DELETE USING (auth.uid() = user_id);
```

> **Existing data?** If you added rows before auth was set up, run:
> `UPDATE proposals SET user_id = '<your-user-id>' WHERE user_id IS NULL;`
> Find your user ID in Supabase → Authentication → Users.

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
- KPI cards: Total, Open, Followed Up, Average Days Live, Overdue alert
- Filter by free-text search, company, and status
- Click any row to open the detail drawer
- Days Live colour coding: green < 14d, amber 14–30d, red > 30d

### Timeline (`/timeline`)
- Gantt-style bars spanning from the proposal send date to the last action (or today for active proposals)
- Looks back over the selected window so you see your real history, not the future
- Orange tick marker on any proposal with a deadline
- Last-action dot shows when you most recently touched a proposal
- Zoom: 1 month, 3 months, 6 months, 1 year
- Group by Company toggle
- Hover tooltip with recipient, summary, and status
- Click any bar or label to open the detail drawer

### Upload Flow
1. Drag-and-drop or click to pick a PDF
2. Claude extracts: title, sender, recipient, company, date, summary, CTA, deadline
3. Edit any extracted fields before saving
4. Saved to Supabase; PDF stored in `proposal-pdfs` bucket

### Proposal Drawer
- Days Live prominently displayed with colour coding
- Inline-edit: Status, Deadline, Notes
- Link to open original PDF
- Delete with confirmation

---

## Project Structure

```
app/
  api/
    upload/         POST — PDF parse + Claude extraction
    proposals/      GET (list) + POST (create)
    proposals/[id]/ PATCH (update) + DELETE
  dashboard/        Main dashboard page
  timeline/         Gantt timeline page
  layout.tsx        Root layout with nav + toast provider
components/
  ui/               Button, Input, Select, Textarea, Modal, Badge, Toast
  proposals/        UploadModal, ProposalDrawer
  NavBar.tsx
lib/
  supabase.ts       Supabase client helpers
  utils.ts          Date formatting, colour helpers
types/
  proposal.ts       TypeScript interfaces
supabase/
  migrations/       SQL migration files
```

---

## Notes

- `pdf-parse` runs server-side only (listed in `serverComponentsExternalPackages`)
- Authentication via Supabase Auth; RLS restricts every user to their own proposals
- Sign in with email + password, or use a magic link for passwordless access
- All dates display as `DD MMM YYYY` (e.g. `13 May 2026`)
