export type ActionStatus = 'Open' | 'Nudged' | 'In Progress' | 'Done' | 'Stalled' | 'Superseded'
export type ActionOwner = 'us' | 'them'
export type StrategicWeight = 'Low' | 'Medium' | 'Medium-High' | 'High'

export interface Action {
  id: string
  created_at: string
  title: string | null
  account_name: string | null
  contact_name: string | null
  owner: ActionOwner
  source_date: string | null
  expected_by: string | null
  expected_by_is_approximate: boolean
  status: ActionStatus
  strategic_weight: StrategicWeight | null
  dependencies: string | null
  parallel_route: string | null
  theme: string | null
  summary: string | null
  notes: string | null
  pdf_url: string | null
  pdf_filename: string | null
  updated_at: string | null
  days_live?: number
  parent_id?: string | null
}

export interface ExtractedAction {
  title: string | null
  account_name: string | null
  contact_name: string | null
  owner: ActionOwner
  source_date: string | null
  expected_by: string | null
  expected_by_is_approximate: boolean
  strategic_weight: StrategicWeight | null
  dependencies: string | null
  summary: string | null
  status: ActionStatus
}

// Aliases so any code not yet migrated continues to compile
export type Proposal = Action
export type ProposalStatus = ActionStatus
export type ExtractedProposal = ExtractedAction
