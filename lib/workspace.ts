import { getAuthClient } from '@/lib/supabase-server'

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

