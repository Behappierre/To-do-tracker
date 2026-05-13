'use client'

import { useState, useEffect, useRef } from 'react'
import { Proposal, ProposalStatus } from '@/types/proposal'
import { formatDate } from '@/lib/utils'
import { addMonths, differenceInDays, parseISO, startOfDay, format, addDays, min } from 'date-fns'
import { cn } from '@/lib/utils'


const STATUS_BG: Record<ProposalStatus, string> = {
  Open: 'bg-blue-500',
  'Followed Up': 'bg-yellow-500',
  Responded: 'bg-green-500',
  Closed: 'bg-gray-500',
  Stalled: 'bg-red-500',
}

const ZOOM_MONTHS = [1, 3, 6, 12]

export default function TimelinePage() {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState(3)
  const [groupByCompany, setGroupByCompany] = useState(false)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; proposal: Proposal } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/proposals').then((r) => r.json()).then((d) => {
      setProposals(Array.isArray(d) ? d : [])
      setLoading(false)
    })
  }, [])

  const today = startOfDay(new Date())
  const windowStart = today
  const windowEnd = addMonths(today, zoom)
  const totalDays = differenceInDays(windowEnd, windowStart)

  // Build month labels
  const monthLabels: { label: string; left: number }[] = []
  let cur = new Date(windowStart)
  cur.setDate(1)
  if (cur < windowStart) cur = addMonths(cur, 1)
  while (cur <= windowEnd) {
    const left = (differenceInDays(cur, windowStart) / totalDays) * 100
    monthLabels.push({ label: format(cur, zoom <= 3 ? 'MMM yyyy' : 'MMM yy'), left })
    cur = addMonths(cur, 1)
  }

  const getBar = (p: Proposal) => {
    if (!p.proposal_date) return null
    const start = parseISO(p.proposal_date)
    const end = p.deadline ? min([parseISO(p.deadline), addDays(today, 7)]) : addDays(today, 7)
    const barStart = start < windowStart ? windowStart : start
    const barEnd = end > windowEnd ? windowEnd : end
    if (barStart > windowEnd || barEnd < windowStart) return null
    const left = (differenceInDays(barStart, windowStart) / totalDays) * 100
    const width = Math.max((differenceInDays(barEnd, barStart) / totalDays) * 100, 0.5)
    return { left, width }
  }

  const rows = groupByCompany
    ? Object.entries(
        proposals.reduce((acc, p) => {
          const key = p.recipient_company ?? 'Unknown'
          if (!acc[key]) acc[key] = []
          acc[key].push(p)
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Timeline</h1>
          <p className="text-gray-500 text-sm mt-0.5">Gantt view of all proposals</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Group by company toggle */}
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <div
              className={cn(
                'w-10 h-5 rounded-full transition-colors relative',
                groupByCompany ? 'bg-indigo-600' : 'bg-gray-300'
              )}
              onClick={() => setGroupByCompany((v) => !v)}
            >
              <div className={cn(
                'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                groupByCompany ? 'translate-x-5' : 'translate-x-0.5'
              )} />
            </div>
            Group by Company
          </label>
          {/* Zoom buttons */}
          <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
            {ZOOM_MONTHS.map((m) => (
              <button
                key={m}
                onClick={() => setZoom(m)}
                className={cn(
                  'px-3 py-1.5 font-medium transition-colors',
                  zoom === m ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                )}
              >
                {m === 12 ? '1yr' : `${m}mo`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {(Object.keys(STATUS_BG) as ProposalStatus[]).map((s) => (
          <div key={s} className="flex items-center gap-1.5 text-xs text-gray-600">
            <div className={cn('w-3 h-3 rounded-full', STATUS_BG[s])} />
            {s}
          </div>
        ))}
      </div>

      {proposals.length === 0 ? (
        <div className="text-center py-20 text-gray-400">No proposals to display.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Month header */}
          <div className="relative h-8 border-b bg-gray-50 overflow-hidden">
            {monthLabels.map(({ label, left }) => (
              <span
                key={label}
                className="absolute text-xs text-gray-500 font-medium top-1.5 transform -translate-x-1/2"
                style={{ left: `${left}%` }}
              >
                {label}
              </span>
            ))}
            {/* Today marker label */}
            <span className="absolute text-xs text-indigo-600 font-bold top-1.5 transform -translate-x-1/2" style={{ left: '0%' }}>
              Today
            </span>
          </div>

          <div ref={containerRef} className="relative overflow-y-auto max-h-[60vh]">
            {rows.map(([group, items]) => (
              <div key={group}>
                {groupByCompany && (
                  <div className="sticky left-0 px-4 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 border-b">
                    {group}
                  </div>
                )}
                {(items as Proposal[]).map((p) => {
                  const bar = getBar(p)
                  return (
                    <div key={p.id} className="flex items-center border-b last:border-b-0 hover:bg-gray-50 group">
                      {/* Label */}
                      <div className="w-48 shrink-0 px-4 py-2.5 text-xs text-gray-700 font-medium truncate border-r">
                        {p.proposal_title ?? 'Untitled'}
                      </div>
                      {/* Bar track */}
                      <div className="flex-1 relative h-10 px-2">
                        {bar && (
                          <div
                            className={cn(
                              'absolute top-2 h-6 rounded-full cursor-pointer opacity-90 hover:opacity-100 transition-opacity flex items-center px-2',
                              STATUS_BG[p.status as ProposalStatus] ?? 'bg-gray-400'
                            )}
                            style={{ left: `${bar.left}%`, width: `${bar.width}%`, minWidth: '4px' }}
                            onMouseEnter={(e) => {
                              const rect = containerRef.current?.getBoundingClientRect()
                              if (rect) {
                                setTooltip({
                                  x: e.clientX - rect.left,
                                  y: e.clientY - rect.top - 10,
                                  proposal: p,
                                })
                              }
                            }}
                            onMouseLeave={() => setTooltip(null)}
                          >
                            <span className="text-white text-xs truncate leading-none hidden sm:block">
                              {p.recipient_name}
                            </span>
                          </div>
                        )}
                        {/* Today line */}
                        <div className="absolute top-0 bottom-0 w-px bg-indigo-400 opacity-40" style={{ left: '0%' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}

            {/* Tooltip */}
            {tooltip && (
              <div
                className="absolute z-20 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 pointer-events-none shadow-xl max-w-xs"
                style={{ left: tooltip.x + 12, top: tooltip.y }}
              >
                <p className="font-semibold mb-1">{tooltip.proposal.proposal_title}</p>
                <p className="text-gray-300">{tooltip.proposal.recipient_name} · {tooltip.proposal.recipient_company}</p>
                <p className="text-gray-300 mt-1 line-clamp-2">{tooltip.proposal.summary}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={cn('inline-block w-2 h-2 rounded-full', STATUS_BG[tooltip.proposal.status as ProposalStatus])} />
                  <span>{tooltip.proposal.status}</span>
                  {tooltip.proposal.deadline && <span className="text-gray-400">· Due {formatDate(tooltip.proposal.deadline)}</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
