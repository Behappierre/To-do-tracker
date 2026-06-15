import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/supabase-server'
import { getServiceClient } from '@/lib/supabase'
import { computeDaysLive } from '@/lib/utils'

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

    const { searchParams } = new URL(req.url)
    const account = searchParams.get('account')
    const status  = searchParams.get('status')
    const owner   = searchParams.get('owner')
    const weight  = searchParams.get('weight')
    const search  = searchParams.get('search')

    let query = supabase
      .from('proposals')
      .select('*')
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

    const actions = (data || []).map((p) => ({
      ...p,
      days_live: computeDaysLive(p.updated_at),
    }))

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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { pdfBase64, ...actionData } = body

    const { data, error } = await supabase
      .from('proposals')
      .insert({
        ...actionData,
        pdf_url,
        user_id: user.id,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ...data, days_live: computeDaysLive(data.updated_at) })
  } catch (err) {
    console.error('POST /api/proposals error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
