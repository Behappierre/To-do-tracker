import { NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/supabase-server'
import { computeDaysLive } from '@/lib/utils'
import { getBusinessDevelopmentWorkspaceId } from '@/lib/workspace'
import { similarity, normalize } from '@/lib/similarity'
import { Action, ActionStatus } from '@/types/proposal'

const ACTION_SELECT = `
  *,
  company:companies!proposals_company_fk(name),
  primary_stakeholder:stakeholders!proposals_primary_stakeholder_fk(full_name)
`

const MATCH_THRESHOLD = 0.3
const MAX_PAIRS = 100
const EXCLUDED_STATUSES = new Set<ActionStatus>(['Done', 'Superseded'])

function formatAction(row: Record<string, unknown>): Action {
  const company = row.company as { name?: string } | null
  const stakeholder = row.primary_stakeholder as { full_name?: string } | null

  return {
    ...row,
    company: undefined,
    primary_stakeholder: undefined,
    company_name: company?.name ?? null,
    stakeholder_name: stakeholder?.full_name ?? null,
    days_live: computeDaysLive(row.updated_at as string | null),
  } as unknown as Action
}

function scorePair(a: Action, b: Action) {
  return 0.7 * similarity(a.title, b.title) + 0.3 * similarity(a.summary, b.summary)
}

export async function GET() {
  try {
    const supabase = getAuthClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    const workspaceId = await getBusinessDevelopmentWorkspaceId(supabase)

    const [{ data: rows, error }, { data: dismissals, error: dismissError }] = await Promise.all([
      supabase
        .from('proposals')
        .select(ACTION_SELECT)
        .eq('workspace_id', workspaceId)
        .is('archived_at', null),
      supabase
        .from('action_duplicate_dismissals')
        .select('action_id_a, action_id_b')
        .eq('workspace_id', workspaceId),
    ])

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (dismissError) return NextResponse.json({ error: dismissError.message }, { status: 500 })

    const candidates = (rows || [])
      .map((r) => formatAction(r))
      .filter((a) => !EXCLUDED_STATUSES.has(a.status))

    const dismissedKeys = new Set(
      (dismissals || []).map((d) => `${d.action_id_a}::${d.action_id_b}`)
    )

    // Group by normalized account so we only ever compare actions on the same account.
    const byAccount = new Map<string, Action[]>()
    for (const a of candidates) {
      const key = normalize(a.account_name)
      if (!key) continue
      if (!byAccount.has(key)) byAccount.set(key, [])
      byAccount.get(key)!.push(a)
    }

    const pairs: { actionA: Action; actionB: Action; score: number }[] = []
    for (const group of byAccount.values()) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i]
          const b = group[j]
          if (a.parent_id === b.id || b.parent_id === a.id) continue // already linked

          const [lo, hi] = a.id < b.id ? [a.id, b.id] : [b.id, a.id]
          if (dismissedKeys.has(`${lo}::${hi}`)) continue

          const score = scorePair(a, b)
          if (score >= MATCH_THRESHOLD) pairs.push({ actionA: a, actionB: b, score })
        }
      }
    }

    pairs.sort((x, y) => y.score - x.score)

    return NextResponse.json(pairs.slice(0, MAX_PAIRS))
  } catch (err) {
    console.error('GET /api/action-duplicates error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
