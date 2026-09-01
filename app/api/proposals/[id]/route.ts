import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/supabase-server'
import { getServiceClient } from '@/lib/supabase'
import { computeDaysLive } from '@/lib/utils'
import { getBusinessDevelopmentWorkspaceId } from '@/lib/workspace'

const ACTION_SELECT = `
  *,
  company:companies!proposals_company_fk(name),
  primary_stakeholder:stakeholders!proposals_primary_stakeholder_fk(full_name),
  internal_followup:stakeholders!proposals_internal_followup_fk(full_name)
`

function formatAction(row: Record<string, unknown>) {
  const company = row.company as { name?: string } | null
  const stakeholder = row.primary_stakeholder as { full_name?: string } | null
  const internalFollowup = row.internal_followup as { full_name?: string } | null

  return {
    ...row,
    company: undefined,
    primary_stakeholder: undefined,
    internal_followup: undefined,
    company_name: company?.name ?? null,
    stakeholder_name: stakeholder?.full_name ?? null,
    internal_followup_name: internalFollowup?.full_name ?? null,
    days_live: computeDaysLive(row.updated_at as string | null),
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getAuthClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    const workspaceId = await getBusinessDevelopmentWorkspaceId(supabase)

    const body = await req.json()
    const allowed = [
      'status', 'notes', 'expected_by', 'expected_by_is_approximate',
      'title', 'account_name', 'contact_name', 'source_date', 'summary',
      'owner', 'strategic_weight', 'dependencies', 'parallel_route', 'parent_id',
      'company_id', 'primary_stakeholder_id', 'internal_followup_stakeholder_id',
      'company_link_status', 'stakeholder_link_status',
    ]

    const updates: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) updates[key] = body[key]
    }
    const nextOwner = body.owner === 'us' || body.owner === 'them'
      ? body.owner
      : undefined
    const nextStakeholder = 'primary_stakeholder_id' in body
      ? body.primary_stakeholder_id || null
      : undefined

    if (nextOwner === 'us') {
      updates.assigned_user_id = user.id
      updates.external_owner_stakeholder_id = null
    } else if (nextOwner === 'them') {
      updates.assigned_user_id = null
      if (nextStakeholder !== undefined) {
        updates.external_owner_stakeholder_id = nextStakeholder
      }
    } else if (nextStakeholder !== undefined) {
      updates.external_owner_stakeholder_id = nextStakeholder
    }

    const { data, error } = await supabase
      .from('proposals')
      .update(updates)
      .eq('workspace_id', workspaceId)
      .eq('id', params.id)
      .select(ACTION_SELECT)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(formatAction(data))
  } catch (err) {
    console.error('PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getAuthClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    const workspaceId = await getBusinessDevelopmentWorkspaceId(supabase)

    const { data: action } = await supabase
      .from('proposals')
      .select('pdf_url, pdf_filename')
      .eq('workspace_id', workspaceId)
      .eq('id', params.id)
      .single()

    if (action?.pdf_url) {
      const url = new URL(action.pdf_url)
      const pathParts = url.pathname.split('/proposal-pdfs/')
      if (pathParts.length > 1) {
        const serviceClient = getServiceClient()
        await serviceClient.storage.from('proposal-pdfs').remove([pathParts[1]])
      }
    }

    const { error } = await supabase
      .from('proposals')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('id', params.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
