import { redirect } from 'next/navigation'
import { StakeholderReviewQueue } from '@/components/stakeholders/StakeholderReviewQueue'
import { getAuthClient } from '@/lib/supabase-server'
import {
  groupDuplicateReviewItems,
  type StakeholderDuplicateReviewItem,
} from '@/types/stakeholder-review'

export const dynamic = 'force-dynamic'

const REVIEW_COLUMNS = [
  'source_id',
  'group_id',
  'workspace_id',
  'company_id',
  'company_name',
  'full_name',
  'title',
  'department',
  'seniority_level',
  'influence_score',
  'sentiment',
  'sentiment_confidence',
  'source_status',
  'notes',
  'email',
  'phone',
  'linkedin_url',
  'source_created_at',
  'source_updated_at',
  'recommended_primary',
  'suggested_resolution',
  'suggestion_reason',
  'review_status',
  'resolved_at',
  'created_at',
].join(',')

export default async function StakeholderReviewPage() {
  const supabase = getAuthClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) redirect('/login')

  const { data, error } = await supabase
    .from('stakeholder_duplicate_review_items')
    .select(REVIEW_COLUMNS)
    .eq('review_status', 'pending')
    .order('group_id')
    .order('recommended_primary', { ascending: false })

  const items = (data ?? []) as unknown as StakeholderDuplicateReviewItem[]
  const groups = groupDuplicateReviewItems(items)

  return (
    <StakeholderReviewQueue
      groups={groups}
      loadError={error?.message ?? null}
      resolutionEnabled={
        process.env.STAKEHOLDER_DUPLICATE_RESOLUTION_ENABLED === 'true'
      }
    />
  )
}
