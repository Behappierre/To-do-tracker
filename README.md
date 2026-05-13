# ProposalTracker

AI-powered outbound proposal tracking app. Upload PDF proposals, let Claude extract the details, then track status, days live, and timelines — all in one dashboard.

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

Run the migration SQL in the Supabase SQL Editor (Dashboard → SQL Editor):

```sql
CREATE TABLE IF NOT EXISTS proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
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

ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations" ON proposals FOR ALL USING (true) WITH CHECK (true);
```

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
- Gantt-style bars from proposal date to deadline
- Zoom: 1 month, 3 months, 6 months, 1 year
- Group by Company toggle
- Hover tooltip with recipient, summary, and status

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
- No authentication — single-user app with open RLS policy
- All dates display as `DD MMM YYYY` (e.g. `13 May 2026`)
