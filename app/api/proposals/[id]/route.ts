import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/supabase-server'
import { getServiceClient } from '@/lib/supabase'
import { computeDaysLive } from '@/lib/utils'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getAuthClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const body = await req.json()
    const allowed = [
      'status', 'notes', 'expected_by', 'expected_by_is_approximate',
      'title', 'account_name', 'contact_name', 'source_date', 'summary',
      'owner', 'strategic_weight', 'dependencies', 'parallel_route', 'parent_id',
    ]

    const updates: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) updates[key] = body[key]
    }

    const { data, error } = await supabase
      .from('proposals')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ...data, days_live: computeDaysLive(data.updated_at) })
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

    const { data: action } = await supabase
      .from('proposals')
      .select('pdf_url, pdf_filename')
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

    const { error } = await supabase.from('proposals').delete().eq('id', params.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
