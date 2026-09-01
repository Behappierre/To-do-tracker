import { getAuthClient } from '@/lib/supabase-server'
import { INTERNAL_COMPANY_NAME, DEFAULT_FOLLOWUP_STAKEHOLDER_NAME } from '@/lib/internal-team'

export const BUSINESS_DEVELOPMENT_WORKSPACE_SLUG = 'business-development'

export async function getBusinessDevelopmentWorkspaceId(
  supabase: ReturnType<typeof getAuthClient>
) {
  const { data, error } = await supabase
    .from('workspaces')
    .select('id')
    .eq('slug', BUSINESS_DEVELOPMENT_WORKSPACE_SLUG)
    .single()

  if (error || !data) {
    throw new Error('Business development workspace is unavailable for this user.')
  }

  return data.id as string
}

export async function getInternalCompanyId(
  supabase: ReturnType<typeof getAuthClient>,
  workspaceId: string
) {
  const { data, error } = await supabase
    .from('companies')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('name', INTERNAL_COMPANY_NAME)
    .single()

  if (error || !data) {
    throw new Error(`Internal company "${INTERNAL_COMPANY_NAME}" is not set up for this workspace.`)
  }

  return data.id as string
}

export async function getDefaultFollowUpStakeholderId(
  supabase: ReturnType<typeof getAuthClient>,
  workspaceId: string
) {
  const internalCompanyId = await getInternalCompanyId(supabase, workspaceId)
  const { data, error } = await supabase
    .from('stakeholders')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('company_id', internalCompanyId)
    .eq('full_name', DEFAULT_FOLLOWUP_STAKEHOLDER_NAME)
    .single()

  if (error || !data) {
    throw new Error(`Default follow-up owner "${DEFAULT_FOLLOWUP_STAKEHOLDER_NAME}" is not set up for this workspace.`)
  }

  return data.id as string
}

