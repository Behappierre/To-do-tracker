export type ActionStatus = 'Open' | 'Nudged' | 'In Progress' | 'Done' | 'Stalled' | 'Superseded'
export type ActionOwner = 'us' | 'them'
export type StrategicWeight = 'Low' | 'Medium' | 'Medium-High' | 'High'
export type LinkReviewStatus = 'pending' | 'linked' | 'no_match'

export interface Action {
  id: string
  created_at: string
  workspace_id: string
  company_id: string | null
  primary_stakeholder_id: string | null
  assigned_user_id: string | null
  external_owner_stakeholder_id: string | null
  created_by: string | null
  archived_at: string | null
  company_link_status: LinkReviewStatus
  stakeholder_link_status: LinkReviewStatus
  link_reviewed_at: string | null
  link_reviewed_by: string | null
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
  company_name?: string | null
  stakeholder_name?: string | null
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

export interface CompanyOption {
  id: string
  name: string
}

export interface StakeholderOption {
  id: string
  company_id: string | null
  full_name: string
  title: string | null
}

export interface EntityOptions {
  companies: CompanyOption[]
  stakeholders: StakeholderOption[]
}

// Aliases so any code not yet migrated continues to compile
export type Proposal = Action
export type ProposalStatus = ActionStatus
export type ExtractedProposal = ExtractedAction
