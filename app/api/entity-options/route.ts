import { NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/supabase-server'
import { getBusinessDevelopmentWorkspaceId } from '@/lib/workspace'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = getAuthClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const workspaceId = await getBusinessDevelopmentWorkspaceId(supabase)
    const [companiesResult, stakeholdersResult] = await Promise.all([
      supabase
        .from('companies')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .eq('status', 'active')
        .order('name'),
      supabase
        .from('stakeholders')
        .select('id, company_id, full_name, title')
        .eq('workspace_id', workspaceId)
        .eq('status', 'active')
        .order('full_name'),
    ])

    if (companiesResult.error) throw companiesResult.error
    if (stakeholdersResult.error) throw stakeholdersResult.error

    return NextResponse.json({
      companies: companiesResult.data ?? [],
      stakeholders: stakeholdersResult.data ?? [],
    })
  } catch (error) {
    console.error('GET /api/entity-options error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
