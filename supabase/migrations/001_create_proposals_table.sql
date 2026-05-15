-- Create proposals table
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
  pdf_filename text,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Enable Row Level Security
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

-- Users can only access their own proposals
CREATE POLICY "Users access own proposals" ON proposals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Create storage bucket for PDFs (run in Supabase dashboard Storage tab or via API)
-- Bucket name: proposal-pdfs (public)
