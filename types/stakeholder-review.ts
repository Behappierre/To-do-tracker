export type DuplicateResolution = 'merge' | 'keep_separate' | 'dismissed'

export type SuggestedResolution = 'merge_likely' | 'manual_review'

export interface StakeholderDuplicateReviewItem {
  source_id: string
  group_id: number
  workspace_id: string
  company_id: string
  company_name: string
  full_name: string
  title: string | null
  department: string | null
  seniority_level: string | null
  influence_score: number | null
  sentiment: string
  sentiment_confidence: number | null
  source_status: 'active' | 'archived'
  notes: string | null
  email: string | null
  phone: string | null
  linkedin_url: string | null
  source_created_at: string | null
  source_updated_at: string | null
  recommended_primary: boolean
  suggested_resolution: SuggestedResolution
  suggestion_reason: string
  review_status: 'pending' | DuplicateResolution
  resolved_at: string | null
  created_at: string
}

export interface StakeholderDuplicateGroup {
  groupId: number
  companyName: string
  fullName: string
  suggestedResolution: SuggestedResolution
  suggestionReason: string
  items: StakeholderDuplicateReviewItem[]
}

export function groupDuplicateReviewItems(
  items: StakeholderDuplicateReviewItem[]
): StakeholderDuplicateGroup[] {
  const groups = new Map<number, StakeholderDuplicateReviewItem[]>()

  for (const item of items) {
    const group = groups.get(item.group_id) ?? []
    group.push(item)
    groups.set(item.group_id, group)
  }

  return Array.from(groups, ([groupId, groupItems]) => {
    const sortedItems = [...groupItems].sort((a, b) => {
      if (a.recommended_primary !== b.recommended_primary) {
        return a.recommended_primary ? -1 : 1
      }
      return (a.source_created_at ?? '').localeCompare(b.source_created_at ?? '')
    })
    const first = sortedItems[0]

    return {
      groupId,
      companyName: first.company_name,
      fullName: first.full_name,
      suggestedResolution: first.suggested_resolution,
      suggestionReason: first.suggestion_reason,
      items: sortedItems,
    }
  }).sort((a, b) => {
    const companyComparison = a.companyName.localeCompare(b.companyName)
    return companyComparison || a.fullName.localeCompare(b.fullName)
  })
}
