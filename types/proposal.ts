export type ProposalStatus = 'Open' | 'Followed Up' | 'Responded' | 'Closed' | 'Stalled'

export interface Proposal {
  id: string
  created_at: string
  proposal_title: string | null
  sender_name: string | null
  recipient_name: string | null
  recipient_company: string | null
  proposal_date: string | null
  summary: string | null
  call_to_action: string | null
  deadline: string | null
  status: ProposalStatus
  notes: string | null
  pdf_url: string | null
  pdf_filename: string | null
  days_live?: number
}

export interface ExtractedProposal {
  proposal_title: string | null
  sender_name: string | null
  recipient_name: string | null
  recipient_company: string | null
  proposal_date: string | null
  summary: string | null
  call_to_action: string | null
  deadline: string | null
}
