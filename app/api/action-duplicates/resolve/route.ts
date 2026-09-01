import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/supabase-server'
import { getBusinessDevelopmentWorkspaceId } from '@/lib/workspace'

interface ResolveBody {
  actionIdA?: string
  actionIdB?: string
  resolution?: 'supersede' | 'dismissed'
  keepOpenId?: string
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getAuthClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    const workspaceId = await getBusinessDevelopmentWorkspaceId(supabase)

    const { actionIdA, actionIdB, resolution, keepOpenId } = (await req.json()) as ResolveBody

    if (!actionIdA || !actionIdB || actionIdA === actionIdB) {
      return NextResponse.json({ error: 'Two distinct action ids are required' }, { status: 400 })
    }

    if (resolution === 'dismissed') {
      const [actionIdLow, actionIdHigh] = actionIdA < actionIdB ? [actionIdA, actionIdB] : [actionIdB, actionIdA]

      const { error } = await supabase
        .from('action_duplicate_dismissals')
        .upsert(
          { workspace_id: workspaceId, action_id_a: actionIdLow, action_id_b: actionIdHigh, dismissed_by: user.id },
          { onConflict: 'action_id_a,action_id_b', ignoreDuplicates: true }
        )

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    if (resolution === 'supersede') {
      if (keepOpenId !== actionIdA && keepOpenId !== actionIdB) {
        return NextResponse.json({ error: 'keepOpenId must match one of the two actions' }, { status: 400 })
      }
      const supersedeId = keepOpenId === actionIdA ? actionIdB : actionIdA

      const { error } = await supabase
        .from('proposals')
        .update({ status: 'Superseded', parent_id: keepOpenId })
        .eq('workspace_id', workspaceId)
        .eq('id', supersedeId)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown resolution' }, { status: 400 })
  } catch (err) {
    console.error('POST /api/action-duplicates/resolve error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
