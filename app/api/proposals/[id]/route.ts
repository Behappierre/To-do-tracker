import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { computeDaysLive } from '@/lib/utils'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getServiceClient()
    const body = await req.json()
    const allowed = ['status', 'notes', 'deadline', 'proposal_title', 'sender_name',
      'recipient_name', 'recipient_company', 'proposal_date', 'summary', 'call_to_action']

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

    return NextResponse.json({ ...data, days_live: computeDaysLive(data.proposal_date) })
  } catch (err) {
    console.error('PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getServiceClient()

    // Get the proposal to find the PDF path
    const { data: proposal } = await supabase
      .from('proposals')
      .select('pdf_url, pdf_filename')
      .eq('id', params.id)
      .single()

    // Delete the PDF from storage if it exists
    if (proposal?.pdf_url) {
      const url = new URL(proposal.pdf_url)
      const pathParts = url.pathname.split('/proposal-pdfs/')
      if (pathParts.length > 1) {
        await supabase.storage.from('proposal-pdfs').remove([pathParts[1]])
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
