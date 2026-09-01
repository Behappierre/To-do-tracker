import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/supabase-server'
import { getServiceClient } from '@/lib/supabase'
import { computeDaysLive } from '@/lib/utils'
import { getBusinessDevelopmentWorkspaceId, getDefaultFollowUpStakeholderId } from '@/lib/workspace'

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

export async function GET(req: NextRequest) {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Supabase environment variables are not configured. Please create .env.local — see README.md.' }, { status: 500 })
    }

    const supabase = getAuthClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
    const workspaceId = await getBusinessDevelopmentWorkspaceId(supabase)

    const { searchParams } = new URL(req.url)
    const account = searchParams.get('account')
    const status  = searchParams.get('status')
    const owner   = searchParams.get('owner')
    const weight  = searchParams.get('weight')
    const search  = searchParams.get('search')

    let query = supabase
      .from('proposals')
      .select(ACTION_SELECT)
      .eq('workspace_id', workspaceId)
      .is('archived_at', null)
      .order('created_at', { ascending: false })

    if (account) query = query.ilike('account_name', `%${account}%`)
    if (status && status !== 'All') query = query.eq('status', status)
    if (owner && owner !== 'All') query = query.eq('owner', owner)
    if (weight && weight !== 'All') query = query.eq('strategic_weight', weight)
    if (search) {
      query = query.or(
        `title.ilike.%${search}%,contact_name.ilike.%${search}%,account_name.ilike.%${search}%`
      )
    }

    const { data, error } = await query

    if (error) {
      console.error('GET /api/proposals Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const actions = (data || []).map((p) => formatAction(p))

    return NextResponse.json(actions)
  } catch (err) {
    console.error('GET /api/proposals error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getAuthClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
    const workspaceId = await getBusinessDevelopmentWorkspaceId(supabase)

    const serviceClient = getServiceClient()
    const body = await req.json()

    let pdf_url = body.pdf_url || null
    if (body.pdfBase64 && body.pdf_filename) {
      const buffer = Buffer.from(body.pdfBase64, 'base64')
      const filename = `${Date.now()}-${body.pdf_filename}`

      const { data: uploadData, error: uploadError } = await serviceClient.storage
        .from('proposal-pdfs')
        .upload(filename, buffer, { contentType: 'application/pdf', upsert: false })

      if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 500 })
      }

      const { data: urlData } = serviceClient.storage.from('proposal-pdfs').getPublicUrl(uploadData.path)
      pdf_url = urlData.publicUrl
    }

    const allowed = [
      'title', 'account_name', 'contact_name', 'owner', 'source_date',
      'expected_by', 'expected_by_is_approximate', 'status',
      'strategic_weight', 'dependencies', 'parallel_route', 'theme',
      'summary', 'notes', 'pdf_filename', 'parent_id', 'company_id',
      'primary_stakeholder_id', 'internal_followup_stakeholder_id',
    ]
    const actionData: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) actionData[key] = body[key]
    }

    const owner = body.owner === 'us' ? 'us' : 'them'
    const primaryStakeholderId = body.primary_stakeholder_id || null

    // Every action needs a Netcompany-side follow-up owner, regardless of
    // who the action itself belongs to — default to Harry Kaur unless the
    // caller explicitly chose someone else.
    if (!actionData.internal_followup_stakeholder_id) {
      actionData.internal_followup_stakeholder_id =
        await getDefaultFollowUpStakeholderId(supabase, workspaceId)
    }

    const { data, error } = await supabase
      .from('proposals')
      .insert({
        ...actionData,
        workspace_id: workspaceId,
        pdf_url,
        user_id: user.id,
        created_by: user.id,
        assigned_user_id: owner === 'us' ? user.id : null,
        external_owner_stakeholder_id:
          owner === 'them' ? primaryStakeholderId : null,
      })
      .select(ACTION_SELECT)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(formatAction(data))
  } catch (err) {
    console.error('POST /api/proposals error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
