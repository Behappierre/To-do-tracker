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
    const allowed = ['status', 'notes', 'deadline', 'proposal_title', 'sender_name',
      'recipient_name', 'recipient_company', 'proposal_date', 'summary', 'call_to_action', 'parent_id']

    const updates: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) updates[key] = body[key]
    }

    // RLS ensures the row belongs to the authenticated user
    const { data, error } = await supabase
      .from('proposals')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ...data, days_live: computeDaysLive(data.proposal_date) })
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

    // Get the proposal first (RLS ensures ownership)
    const { data: proposal } = await supabase
      .from('proposals')
      .select('pdf_url, pdf_filename')
      .eq('id', params.id)
      .single()

    // Delete the PDF from storage if it exists (storage removal needs service role)
    if (proposal?.pdf_url) {
      const url = new URL(proposal.pdf_url)
      const pathParts = url.pathname.split('/proposal-pdfs/')
      if (pathParts.length > 1) {
        const serviceClient = getServiceClient()
        await serviceClient.storage.from('proposal-pdfs').remove([pathParts[1]])
      }
    }

    // RLS ensures the row belongs to the authenticated user
    const { error } = await supabase.from('proposals').delete().eq('id', params.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
