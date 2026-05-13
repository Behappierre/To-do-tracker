'use client'

import { useState, useEffect, useRef } from 'react'
import { Proposal, ProposalStatus } from '@/types/proposal'
import { formatDate, cn } from '@/lib/utils'
import { ProposalDrawer } from '@/components/proposals/ProposalDrawer'
import {
  addMonths, differenceInDays, parseISO, startOfDay,
  format, isAfter, isBefore,
} from 'date-fns'

// Colours per status
const STATUS_BG: Record<ProposalStatus, string> = {
  Open: 'bg-blue-500',
  'Followed Up': 'bg-yellow-500',
  Responded: 'bg-green-500',
  Closed: 'bg-gray-400',
  Stalled: 'bg-red-500',
}
const STATUS_HEX: Record<ProposalStatus, string> = {
  Open: '#3b82f6',
  'Followed Up': '#eab308',
  Responded: '#22c55e',
  Closed: '#9ca3af',
  Stalled: '#ef4444',
}

// Statuses where the proposal is no longer actively live
const TERMINAL = new Set<ProposalStatus>(['Responded', 'Closed'])

const ZOOM_MONTHS = [1, 3, 6, 12]

export default function TimelinePage() {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState(3)
  const [groupByCompany, setGroupByCompany] = useState(false)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; proposal: Proposal } | null>(null)
  const [selected, setSelected] = useState<Proposal | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/proposals')
      .then((r) => r.json())
      .then((d) => { setProposals(Array.isArray(d) ? d : []); setLoading(false) })
  }, [])

  const handleUpdated = (updated: Proposal) => {
    setProposals(prev => prev.map(p => p.id === updated.id ? updated : p))
    setSelected(updated)
  }

  const handleDeleted = (id: string) => {
    setProposals(prev => prev.filter(p => p.id !== id))
    setSelected(null)
  }

  const today = startOfDay(new Date())
  // Show history: window runs from (today - zoom months) to (today + 1 month for deadlines)
  const windowStart = addMonths(today, -zoom)
  const windowEnd = addMonths(today, 1)
  const totalDays = differenceInDays(windowEnd, windowStart)

  // Convert a date to a % position in the window. Clamped to [0,100].
  const pct = (date: Date) => {
    const raw = (differenceInDays(date, windowStart) / totalDays) * 100
    return Math.min(100, Math.max(0, raw))
  }

  // Month header labels
  const monthLabels: { label: string; left: number }[] = []
  let cur = new Date(windowStart.getFullYear(), windowStart.getMonth(), 1)
  if (isBefore(cur, windowStart)) cur = addMonths(cur, 1)
  while (!isAfter(cur, windowEnd)) {
    monthLabels.push({ label: format(cur, zoom <= 3 ? 'MMM yyyy' : 'MMM yy'), left: pct(cur) })
    cur = addMonths(cur, 1)
  }

  // Build bar geometry for a proposal
  const getBar = (p: Proposal) => {
    if (!p.proposal_date) return null
    const sent = parseISO(p.proposal_date)

    // Bar ends at: updated_at for terminal statuses, otherwise today
    const lastAction = p.updated_at ? parseISO(p.updated_at) : today
    const barEnd = TERMINAL.has(p.status) ? lastAction : today

    // Deadline marker position (null if no deadline or outside window)
    let deadlinePct: number | null = null
    if (p.deadline) {
      const dl = parseISO(p.deadline)
      if (!isBefore(dl, windowStart) && !isAfter(dl, windowEnd)) {
        deadlinePct = pct(dl)
      }
    }

    // Last-action marker (only meaningful if proposal is not terminal and action is in window)
    let lastActionPct: number | null = null
    if (!TERMINAL.has(p.status) && p.updated_at) {
      const la = parseISO(p.updated_at)
      if (!isBefore(la, windowStart) && !isAfter(la, windowEnd)) {
        lastActionPct = pct(la)
      }
    }

    // Clamp bar to window
    const clampedStart = isAfter(sent, windowEnd) ? windowEnd : isBefore(sent, windowStart) ? windowStart : sent
    const clampedEnd   = isAfter(barEnd, windowEnd) ? windowEnd : isBefore(barEnd, windowStart) ? windowStart : barEnd

    if (isAfter(clampedStart, clampedEnd)) return null

    return {
      left:  pct(clampedStart),
      right: pct(clampedEnd),
      width: pct(clampedEnd) - pct(clampedStart),
      deadlinePct,
      lastActionPct,
      sentBeforeWindow: isBefore(sent, windowStart),
    }
  }

  const rows = groupByCompany
    ? Object.entries(
        proposals.reduce((acc, p) => {
          const key = p.recipient_company ?? 'Unknown'
          acc[key] = [...(acc[key] ?? []), p]
          return acc
        }, {} as Record<string, Proposal[]>)
      )
    : [['All Proposals', proposals] as [string, Proposal[]]]

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
          {/* Group toggle */}
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <div
              className={cn('w-10 h-5 rounded-full transition-colors relative', groupByCompany ? 'bg-indigo-600' : 'bg-gray-300')}
              onClick={() => setGroupByCompany(v => !v)}
            >
              <div className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', groupByCompany ? 'translate-x-5' : 'translate-x-0.5')} />
            </div>
            Group by Company
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
        <span className="font-medium text-gray-500 uppercase tracking-wide">Status:</span>
        {(Object.keys(STATUS_BG) as ProposalStatus[]).map(s => (
          <div key={s} className="flex items-center gap-1.5">
            <div className={cn('w-3 h-3 rounded-sm', STATUS_BG[s])} />{s}
          </div>
        ))}
        <span className="ml-4 font-medium text-gray-500 uppercase tracking-wide">Markers:</span>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-4 bg-orange-400 rounded-sm" /> Deadline
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full border-2 border-white bg-white ring-2 ring-gray-700" /> Last action
        </div>
      </div>

      {proposals.length === 0 ? (
        <div className="text-center py-20 text-gray-400">No proposals to display.</div>
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

            {rows.map(([group, items]) => (
              <div key={group}>
                {groupByCompany && (
                  <div className="sticky left-0 px-4 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 border-b z-20">
                    {group}
                  </div>
                )}
                {(items as Proposal[]).map(p => {
                  const bar = getBar(p)
                  const status = p.status as ProposalStatus
                  return (
                    <div key={p.id} className="flex items-center border-b last:border-b-0 hover:bg-gray-50 group h-12">
                      {/* Label — also clickable */}
                      <div
                        className="w-48 shrink-0 px-3 text-xs text-gray-700 font-medium truncate border-r h-full flex items-center cursor-pointer hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                        onClick={() => setSelected(p)}
                      >
                        {p.proposal_title ?? 'Untitled'}
                      </div>

                      {/* Bar track */}
                      <div className="flex-1 relative h-full px-0">
                        {bar && (
                          <>
                            {/* Main bar */}
                            <div
                              className={cn(
                                'absolute top-3 h-6 rounded cursor-pointer transition-opacity hover:opacity-100 hover:ring-2 hover:ring-white hover:ring-offset-1',
                                TERMINAL.has(status) ? 'opacity-60' : 'opacity-90',
                                STATUS_BG[status]
                              )}
                              style={{ left: `${bar.left}%`, width: `${Math.max(bar.width, 0.4)}%` }}
                              onClick={() => { setTooltip(null); setSelected(p) }}
                              onMouseEnter={e => {
                                const rect = containerRef.current?.getBoundingClientRect()
                                if (rect) setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 10, proposal: p })
                              }}
                              onMouseLeave={() => setTooltip(null)}
                            >
                              {/* Recipient label inside bar if wide enough */}
                              {bar.width > 8 && (
                                <span className="absolute inset-0 flex items-center px-2 text-white text-xs truncate leading-none">
                                  {p.recipient_name ?? p.recipient_company}
                                </span>
                              )}

                              {/* Deadline marker — orange tick on the bar */}
                              {bar.deadlinePct !== null && (
                                <div
                                  className="absolute top-0 bottom-0 w-1 bg-orange-400 rounded"
                                  style={{ left: `${((bar.deadlinePct - bar.left) / Math.max(bar.width, 0.01)) * 100}%` }}
                                  title={`Deadline: ${formatDate(p.deadline)}`}
                                />
                              )}
                            </div>

                            {/* Last-action dot — sits on the right edge of the bar */}
                            {!TERMINAL.has(status) && bar.lastActionPct !== null && (
                              <div
                                className="absolute top-3.5 w-4 h-4 rounded-full border-2 border-white shadow z-10 -translate-x-1/2 pointer-events-none"
                                style={{
                                  left: `${bar.right}%`,
                                  backgroundColor: STATUS_HEX[status],
                                }}
                                title={`Last action: ${formatDate(p.updated_at)}`}
                              />
                            )}

                            {/* "Sent before window" indicator */}
                            {bar.sentBeforeWindow && (
                              <div
                                className="absolute top-3 h-6 flex items-center"
                                style={{ left: '0%' }}
                              >
                                <span className="text-gray-400 text-xs mr-1">◀</span>
                              </div>
                            )}
                          </>
                        )}
                        {/* No bar — proposal outside window */}
                        {!bar && (
                          <div className="absolute inset-0 flex items-center px-3">
                            <span className="text-xs text-gray-300 italic">outside window</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}

            {/* Tooltip */}
            {tooltip && (
              <div
                className="absolute z-30 bg-gray-900 text-white text-xs rounded-lg px-3 py-2.5 pointer-events-none shadow-xl w-64"
                style={{ left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth ?? 600) - 270), top: tooltip.y }}
              >
                <p className="font-semibold mb-1 leading-tight">{tooltip.proposal.proposal_title}</p>
                <p className="text-gray-300">{tooltip.proposal.recipient_name} · {tooltip.proposal.recipient_company}</p>
                {tooltip.proposal.summary && (
                  <p className="text-gray-400 mt-1.5 line-clamp-2 leading-relaxed">{tooltip.proposal.summary}</p>
                )}
                <div className="mt-2 pt-2 border-t border-gray-700 grid grid-cols-2 gap-x-4 gap-y-1">
                  <span className="text-gray-400">Sent</span>
                  <span>{formatDate(tooltip.proposal.proposal_date)}</span>
                  <span className="text-gray-400">Last action</span>
                  <span>{formatDate(tooltip.proposal.updated_at)}</span>
                  {tooltip.proposal.deadline && <>
                    <span className="text-gray-400">Deadline</span>
                    <span className="text-orange-300">{formatDate(tooltip.proposal.deadline)}</span>
                  </>}
                  <span className="text-gray-400">Status</span>
                  <span className={cn(
                    tooltip.proposal.status === 'Open' ? 'text-blue-300' :
                    tooltip.proposal.status === 'Followed Up' ? 'text-yellow-300' :
                    tooltip.proposal.status === 'Responded' ? 'text-green-300' :
                    tooltip.proposal.status === 'Stalled' ? 'text-red-300' : 'text-gray-300'
                  )}>{tooltip.proposal.status}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
