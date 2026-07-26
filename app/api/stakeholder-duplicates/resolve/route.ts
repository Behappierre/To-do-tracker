import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/supabase-server'
import type { DuplicateResolution } from '@/types/stakeholder-review'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const RESOLUTIONS = new Set<DuplicateResolution>([
  'merge',
  'keep_separate',
  'dismissed',
])

interface ResolutionRequest {
  groupId?: unknown
  resolution?: unknown
  primarySourceId?: unknown
  notes?: unknown
}

export async function POST(request: NextRequest) {
  const requestOrigin = request.headers.get('origin')
  if (requestOrigin && requestOrigin !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  }

  const supabase = getAuthClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  if (process.env.STAKEHOLDER_DUPLICATE_RESOLUTION_ENABLED !== 'true') {
    return NextResponse.json(
      {
        error:
          'Duplicate resolution is locked while the imported data is being validated.',
      },
      { status: 423 }
    )
  }

  let body: ResolutionRequest
  try {
    body = (await request.json()) as ResolutionRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const groupId = Number(body.groupId)
  const resolution =
    typeof body.resolution === 'string'
      ? (body.resolution as DuplicateResolution)
      : null
  const primarySourceId =
    typeof body.primarySourceId === 'string' ? body.primarySourceId : null
  const notes = typeof body.notes === 'string' ? body.notes.trim() : ''

  if (!Number.isSafeInteger(groupId) || groupId <= 0) {
    return NextResponse.json({ error: 'Invalid duplicate group' }, { status: 400 })
  }
  if (!resolution || !RESOLUTIONS.has(resolution)) {
    return NextResponse.json({ error: 'Invalid resolution' }, { status: 400 })
  }
  if (resolution === 'merge' && (!primarySourceId || !UUID_PATTERN.test(primarySourceId))) {
    return NextResponse.json(
      { error: 'Choose the primary record before merging' },
      { status: 400 }
    )
  }
  if (notes.length > 2000) {
    return NextResponse.json(
      { error: 'Resolution notes must be 2,000 characters or fewer' },
      { status: 400 }
    )
  }

  try {
    const admin = getAdminClient()
    const { data, error } = await admin.rpc(
      'resolve_stakeholder_duplicate_group',
      {
        p_group_id: groupId,
        p_resolution: resolution,
        p_primary_source_id: resolution === 'merge' ? primarySourceId : null,
        p_resolution_notes: notes || null,
        p_actor_user_id: user.id,
      }
    )

    if (error) {
      const status = /admin|permission|authori[sz]ed/i.test(error.message) ? 403 : 400
      return NextResponse.json({ error: error.message }, { status })
    }

    return NextResponse.json({ result: data })
  } catch (error) {
    console.error('POST /api/stakeholder-duplicates/resolve error:', error)
    return NextResponse.json(
      { error: 'Duplicate resolution service is unavailable' },
      { status: 503 }
    )
  }
}
