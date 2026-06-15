'use client'

import { useState, useEffect, useRef } from 'react'
import { Action } from '@/types/proposal'
import { formatDate, cn } from '@/lib/utils'
import { ProposalDrawer } from '@/components/proposals/ProposalDrawer'
import { ChevronRight, ChevronDown } from 'lucide-react'
import {
  addMonths, differenceInDays, parseISO, startOfDay,
  format, isAfter, isBefore,
} from 'date-fns'

// Bars are coloured by owner, not status
const OWNER_BG  = { us: 'bg-indigo-500',   them: 'bg-orange-400'   }
const OWNER_HEX = { us: '#6366f1',          them: '#fb923c'          }

// Statuses where the action is no longer actively live
const TERMINAL = new Set(['Done', 'Superseded'])

const ZOOM_MONTHS = [1, 3, 6, 12]

export default function TimelinePage() {
  const [actions, setActions]         = useState<Action[]>([])
  const [loading, setLoading]         = useState(true)
  const [zoom, setZoom]               = useState(3)
  const [groupByAccount, setGroupByAccount] = useState(true)
  const [tooltip, setTooltip]         = useState<{ x: number; y: number; action: Action } | null>(null)
  const [selected, setSelected]       = useState<Action | null>(null)
  const [expanded, setExpanded]       = useState<Set<string>>(new Set())
  const containerRef                  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/proposals')
      .then((r) => r.json())
      .then((d) => { setActions(Array.isArray(d) ? d : []); setLoading(false) })
  }, [])

  const handleUpdated = (updated: Action) => {
    setActions(prev => prev.map(a => a.id === updated.id ? updated : a))
    setSelected(updated)
  }

  const handleDeleted = (id: string) => {
    setActions(prev => prev.filter(a => a.id !== id))
    setSelected(null)
  }

  const today       = startOfDay(new Date())
  const windowStart = addMonths(today, -zoom)
  const windowEnd   = addMonths(today, 1)
  const totalDays   = differenceInDays(windowEnd, windowStart)

  const pct = (date: Date) => {
    const raw = (differenceInDays(date, windowStart) / totalDays) * 100
    return Math.min(100, Math.max(0, raw))
  }

  const monthLabels: { label: string; left: number }[] = []
  let cur = new Date(windowStart.getFullYear(), windowStart.getMonth(), 1)
  if (isBefore(cur, windowStart)) cur = addMonths(cur, 1)
  while (!isAfter(cur, windowEnd)) {
    monthLabels.push({ label: format(cur, zoom <= 3 ? 'MMM yyyy' : 'MMM yy'), left: pct(cur) })
    cur = addMonths(cur, 1)
  }

  const idSet = new Set(actions.map(a => a.id))
  const childMap: Record<string, Action[]> = {}
  const roots: Action[] = []
  for (const a of actions) {
    if (a.parent_id && idSet.has(a.parent_id)) {
      childMap[a.parent_id] = [...(childMap[a.parent_id] ?? []), a]
    } else {
      roots.push(a)
    }
  }

  const getBar = (a: Action) => {
    if (!a.source_date) return null
    const sent = parseISO(a.source_date)

    const lastAction = a.updated_at ? parseISO(a.updated_at) : today
    const barEnd     = TERMINAL.has(a.status) ? lastAction : today

    // Expected-by marker
    let expectedByPct: number | null = null
    if (a.expected_by) {
      const eb = parseISO(a.expected_by)
      if (!isBefore(eb, windowStart) && !isAfter(eb, windowEnd)) {
        expectedByPct = pct(eb)
      }
    }

    let lastActionPct: number | null = null
    if (!TERMINAL.has(a.status) && a.updated_at) {
      const la = parseISO(a.updated_at)
      if (!isBefore(la, windowStart) && !isAfter(la, windowEnd)) {
        lastActionPct = pct(la)
      }
    }

    const clampedStart = isAfter(sent, windowEnd) ? windowEnd : isBefore(sent, windowStart) ? windowStart : sent
    const clampedEnd   = isAfter(barEnd, windowEnd) ? windowEnd : isBefore(barEnd, windowStart) ? windowStart : barEnd

    if (isAfter(clampedStart, clampedEnd)) return null

    return {
      left:  pct(clampedStart),
      right: pct(clampedEnd),
      width: pct(clampedEnd) - pct(clampedStart),
      expectedByPct,
      lastActionPct,
      sentBeforeWindow: isBefore(sent, windowStart),
      approximate: a.expected_by_is_approximate,
    }
  }

  function ActionRow({ a, isChild }: { a: Action; isChild: boolean }) {
    const bar         = getBar(a)
    const ownerKey    = (a.owner ?? 'them') as 'us' | 'them'
    const children    = childMap[a.id] ?? []
    const hasChildren = children.length > 0
    const isExpanded  = expanded.has(a.id)

    return (
      <>
        <div className={cn('flex items-center border-b last:border-b-0 hover:bg-gray-50 group', isChild ? 'h-10 bg-gray-50/60' : 'h-12')}>
          {/* Label */}
          <div
            className={cn(
              'w-48 shrink-0 px-3 text-xs font-medium truncate border-r h-full flex items-center gap-1 cursor-pointer hover:bg-indigo-50 hover:text-indigo-700 transition-colors',
              isChild ? 'text-gray-500 pl-6' : 'text-gray-700',
            )}
            onClick={() => setSelected(a)}
          >
            {isChild && (
              <span className="shrink-0 w-3 h-3 border-l-2 border-b-2 border-gray-300 rounded-bl -mt-2 mr-0.5" />
            )}
            {hasChildren && (
              <button
                className="shrink-0 text-gray-400 hover:text-gray-700"
                onClick={e => {
                  e.stopPropagation()
                  setExpanded(prev => {
                    const next = new Set(prev)
                    if (next.has(a.id)) { next.delete(a.id) } else { next.add(a.id) }
                    return next
                  })
                }}
              >
                {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
            )}
            <span className="truncate">{a.title ?? 'Untitled'}</span>
          </div>

          {/* Bar track */}
          <div className="flex-1 relative h-full px-0">
            {bar && (
              <>
                {/* Main bar, coloured by owner */}
                <div
                  className={cn(
                    'absolute rounded cursor-pointer transition-opacity hover:opacity-100 hover:ring-2 hover:ring-white hover:ring-offset-1',
                    isChild ? 'top-2 h-5 opacity-75' : 'top-3 h-6',
                    TERMINAL.has(a.status) ? 'opacity-50' : 'opacity-90',
                    OWNER_BG[ownerKey],
                  )}
                  style={{ left: `${bar.left}%`, width: `${Math.max(bar.width, 0.4)}%` }}
                  onClick={() => { setTooltip(null); setSelected(a) }}
                  onMouseEnter={e => {
                    const rect = containerRef.current?.getBoundingClientRect()
                    if (rect) setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 10, action: a })
                  }}
                  onMouseLeave={() => setTooltip(null)}
                >
                  {/* Contact label inside bar if wide enough */}
                  {bar.width > 8 && !isChild && (
                    <span className="absolute inset-0 flex items-center px-2 text-white text-xs truncate leading-none">
                      {a.contact_name ?? a.account_name}
                    </span>
                  )}

                  {/* Expected-by marker — solid if exact, dashed/lighter if approximate */}
                  {bar.expectedByPct !== null && (
                    <div
                      className={cn(
                        'absolute top-0 bottom-0 w-1 rounded',
                        bar.approximate ? 'bg-orange-300 opacity-60' : 'bg-orange-500',
                      )}
                      style={{ left: `${((bar.expectedByPct - bar.left) / Math.max(bar.width, 0.01)) * 100}%` }}
                      title={`Expected by: ${formatDate(a.expected_by)}${bar.approximate ? ' (approx)' : ''}`}
                    />
                  )}
                </div>

                {/* Last-action dot */}
                {!TERMINAL.has(a.status) && bar.lastActionPct !== null && (
                  <div
                    className={cn('absolute rounded-full border-2 border-white shadow z-10 -translate-x-1/2 pointer-events-none', isChild ? 'top-3 w-3 h-3' : 'top-3.5 w-4 h-4')}
                    style={{
                      left: `${bar.right}%`,
                      backgroundColor: OWNER_HEX[ownerKey],
                    }}
                    title={`Last action: ${formatDate(a.updated_at)}`}
                  />
                )}

                {bar.sentBeforeWindow && (
                  <div className="absolute top-3 h-6 flex items-center" style={{ left: '0%' }}>
                    <span className="text-gray-400 text-xs mr-1">◀</span>
                  </div>
                )}
              </>
            )}
            {!bar && (
              <div className="absolute inset-0 flex items-center px-3">
                <span className="text-xs text-gray-300 italic">outside window</span>
              </div>
            )}
          </div>
        </div>
        {hasChildren && isExpanded && children.map(child => (
          <ActionRow key={child.id} a={child} isChild />
        ))}
      </>
    )
  }

  const groups = groupByAccount
    ? Object.entries(
        roots.reduce((acc, a) => {
          const key = a.account_name ?? 'Unknown'
          acc[key] = [...(acc[key] ?? []), a]
          return acc
        }, {} as Record<string, Action[]>)
      ).sort(([ka], [kb]) => ka.localeCompare(kb))
    : [['All Actions', roots] as [string, Action[]]]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Timeline</h1>
          <p className="text-gray-500 text-sm mt-0.5">Looking back over the selected period · Today marked in blue</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Group by Account toggle */}
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <div
              className={cn('w-10 h-5 rounded-full transition-colors relative', groupByAccount ? 'bg-indigo-600' : 'bg-gray-300')}
              onClick={() => setGroupByAccount(v => !v)}
            >
              <div className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', groupByAccount ? 'translate-x-5' : 'translate-x-0.5')} />
            </div>
            Group by Account
          </label>
          {/* Zoom */}
          <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
            {ZOOM_MONTHS.map(m => (
              <button
                key={m}
                onClick={() => setZoom(m)}
                className={cn('px-3 py-1.5 font-medium transition-colors', zoom === m ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')}
              >
                {m === 12 ? '1yr' : `${m}mo`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-600 items-center">
        <span className="font-medium text-gray-500 uppercase tracking-wide">Owner:</span>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-indigo-500" /> Us (our team)
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-orange-400" /> Client side
        </div>
        <span className="ml-4 font-medium text-gray-500 uppercase tracking-wide">Markers:</span>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-4 bg-orange-500 rounded-sm" /> Expected by (exact)
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-4 bg-orange-300 opacity-60 rounded-sm" /> Expected by (approx)
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full border-2 border-white bg-white ring-2 ring-gray-700" /> Last action
        </div>
      </div>

      {actions.length === 0 ? (
        <div className="text-center py-20 text-gray-400">No actions to display.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Month header */}
          <div className="relative h-8 border-b bg-gray-50 ml-48">
            {monthLabels.map(({ label, left }) => (
              <span
                key={label}
                className="absolute text-xs text-gray-500 font-medium top-2 -translate-x-1/2 whitespace-nowrap"
                style={{ left: `${left}%` }}
              >
                {label}
              </span>
            ))}
          </div>

          {/* Rows */}
          <div ref={containerRef} className="relative overflow-y-auto max-h-[65vh]">
            {/* Today line */}
            <div
              className="absolute top-0 bottom-0 w-px bg-indigo-400 z-10 pointer-events-none"
              style={{ left: `calc(192px + ${pct(today)}%)` }}
            >
              <span className="absolute -top-0.5 left-1 text-xs text-indigo-500 font-semibold whitespace-nowrap">Today</span>
            </div>

            {groups.map(([group, items]) => (
              <div key={group}>
                {groupByAccount && (
                  <div className="sticky left-0 px-4 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 border-b z-20">
                    {group}
                  </div>
                )}
                {(items as Action[]).map(a => (
                  <ActionRow key={a.id} a={a} isChild={false} />
                ))}
              </div>
            ))}

            {/* Tooltip */}
            {tooltip && (
              <div
                className="absolute z-30 bg-gray-900 text-white text-xs rounded-lg px-3 py-2.5 pointer-events-none shadow-xl w-72"
                style={{ left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth ?? 600) - 290), top: tooltip.y }}
              >
                <p className="font-semibold mb-1 leading-tight">{tooltip.action.title}</p>
                <p className="text-gray-300">{tooltip.action.contact_name} · {tooltip.action.account_name}</p>
                {tooltip.action.summary && (
                  <p className="text-gray-400 mt-1.5 line-clamp-2 leading-relaxed">{tooltip.action.summary}</p>
                )}
                <div className="mt-2 pt-2 border-t border-gray-700 grid grid-cols-2 gap-x-4 gap-y-1">
                  <span className="text-gray-400">Owner</span>
                  <span className={tooltip.action.owner === 'us' ? 'text-indigo-300' : 'text-orange-300'}>
                    {tooltip.action.owner === 'us' ? 'Us' : 'Client'}
                  </span>
                  <span className="text-gray-400">Meeting</span>
                  <span>{formatDate(tooltip.action.source_date)}</span>
                  <span className="text-gray-400">Last action</span>
                  <span>{formatDate(tooltip.action.updated_at)}</span>
                  {tooltip.action.expected_by && <>
                    <span className="text-gray-400">Expected by</span>
                    <span className="text-orange-300">
                      {formatDate(tooltip.action.expected_by)}{tooltip.action.expected_by_is_approximate ? ' ~' : ''}
                    </span>
                  </>}
                  <span className="text-gray-400">Status</span>
                  <span>{tooltip.action.status}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {selected && (
        <ProposalDrawer
          proposal={selected}
          proposals={actions}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}
