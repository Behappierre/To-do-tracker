'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, FileText, Clock, AlertTriangle, Users, ChevronRight, ChevronDown } from 'lucide-react'
import { Action, ActionStatus, StrategicWeight } from '@/types/proposal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { StatusBadge } from '@/components/ui/badge'
import { UploadModal } from '@/components/proposals/UploadModal'
import { ProposalDrawer } from '@/components/proposals/ProposalDrawer'
import { formatDate, daysLiveColor, cn } from '@/lib/utils'
import { differenceInDays, parseISO, compareAsc } from 'date-fns'

const STATUSES: ActionStatus[] = ['Open', 'Nudged', 'In Progress', 'Done', 'Stalled', 'Superseded']
const WEIGHTS: StrategicWeight[] = ['Low', 'Medium', 'Medium-High', 'High']

export default function DashboardPage() {
  const [actions, setActions]         = useState<Action[]>([])
  const [loading, setLoading]         = useState(true)
  const [fetchError, setFetchError]   = useState<string | null>(null)
  const [search, setSearch]           = useState('')
  const [account, setAccount]         = useState('')
  const [status, setStatus]           = useState('All')
  const [owner, setOwner]             = useState('All')
  const [weight, setWeight]           = useState('All')
  const [uploadOpen, setUploadOpen]   = useState(false)
  const [selected, setSelected]       = useState<Action | null>(null)
  const [sortKey, setSortKey]         = useState<string>('created_at')
  const [sortDir, setSortDir]         = useState<'asc' | 'desc'>('desc')
  const [expanded, setExpanded]       = useState<Set<string>>(new Set())
  const [dragId, setDragId]           = useState<string | null>(null)
  const [dragOverId, setDragOverId]   = useState<string | null>(null)

  const fetchActions = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const params = new URLSearchParams()
      if (search)  params.set('search', search)
      if (account) params.set('account', account)
      if (status !== 'All') params.set('status', status)
      if (owner  !== 'All') params.set('owner', owner)
      if (weight !== 'All') params.set('weight', weight)
      const res  = await fetch(`/api/proposals?${params}`)
      const data = await res.json()
      if (!res.ok) { setFetchError(data.error || 'Failed to load actions'); setActions([]); return }
      setActions(Array.isArray(data) ? data : [])
    } catch {
      setFetchError('Network error — is the server running?')
    } finally {
      setLoading(false)
    }
  }, [search, account, status, owner, weight])

  useEffect(() => { fetchActions() }, [fetchActions])

  const accounts = Array.from(new Set(actions.map((a) => a.account_name).filter(Boolean))) as string[]

  const today     = new Date()
  const totalOpen = actions.filter((a) => a.status === 'Open').length
  const awaitingClient = actions.filter(
    (a) => a.owner === 'them' && (a.status === 'Open' || a.status === 'Nudged')
  ).length
  const overdue = actions.filter(
    (a) => a.expected_by &&
      !['Done', 'Superseded'].includes(a.status) &&
      differenceInDays(today, parseISO(a.expected_by)) > 0
  ).length
  const avgDaysLive = actions.length
    ? Math.round(actions.reduce((s, a) => s + (a.days_live ?? 0), 0) / actions.length)
    : 0

  const handleUpdated = (updated: Action) => {
    setActions((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
    setSelected(updated)
  }

  const handleDeleted = (id: string) => {
    setActions((prev) => prev.filter((a) => a.id !== id))
    setSelected(null)
  }

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = [...actions].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'title') {
      cmp = (a.title ?? '').localeCompare(b.title ?? '')
    } else if (sortKey === 'contact_name') {
      cmp = (a.contact_name ?? '').localeCompare(b.contact_name ?? '')
    } else if (sortKey === 'account_name') {
      cmp = (a.account_name ?? '').localeCompare(b.account_name ?? '')
    } else if (sortKey === 'source_date') {
      cmp = a.source_date && b.source_date
        ? compareAsc(parseISO(a.source_date), parseISO(b.source_date))
        : (a.source_date ? 1 : -1)
    } else if (sortKey === 'days_live') {
      cmp = (a.days_live ?? 0) - (b.days_live ?? 0)
    } else if (sortKey === 'expected_by') {
      cmp = a.expected_by && b.expected_by
        ? compareAsc(parseISO(a.expected_by), parseISO(b.expected_by))
        : (a.expected_by ? 1 : -1)
    } else if (sortKey === 'status') {
      cmp = a.status.localeCompare(b.status)
    } else if (sortKey === 'owner') {
      cmp = a.owner.localeCompare(b.owner)
    } else {
      cmp = compareAsc(parseISO(a.created_at), parseISO(b.created_at))
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  const idSet = new Set(sorted.map(a => a.id))
  const childMap: Record<string, Action[]> = {}
  const roots: Action[] = []
  for (const a of sorted) {
    if (a.parent_id && idSet.has(a.parent_id)) {
      childMap[a.parent_id] = [...(childMap[a.parent_id] ?? []), a]
    } else {
      roots.push(a)
    }
  }

  const handleDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId) return
    const target = actions.find(a => a.id === targetId)
    if (!target || target.parent_id) return
    if (childMap[dragId]?.length) return

    setDragOverId(null)
    setDragId(null)

    const res = await fetch(`/api/proposals/${dragId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_id: targetId }),
    })
    if (res.ok) {
      const updated = await res.json()
      setActions(prev => prev.map(a => a.id === dragId ? updated : a))
      setExpanded(prev => { const next = new Set(prev); next.add(targetId); return next })
    }
  }

  function ActionRow({ a, isChild }: { a: Action; isChild: boolean }) {
    const days      = a.days_live ?? 0
    const isOverdue = a.expected_by &&
      !['Done', 'Superseded'].includes(a.status) &&
      differenceInDays(today, parseISO(a.expected_by)) > 0
    const children    = childMap[a.id] ?? []
    const hasChildren = children.length > 0
    const isExpanded  = expanded.has(a.id)
    const isDragOver  = dragOverId === a.id
    const isDragging  = dragId === a.id
    const canReceiveDrop = !isChild && dragId && dragId !== a.id && !(childMap[dragId]?.length)

    return (
      <>
        <tr
          key={a.id}
          draggable
          onDragStart={() => setDragId(a.id)}
          onDragEnd={() => { setDragId(null); setDragOverId(null) }}
          onDragOver={e => { if (canReceiveDrop) { e.preventDefault(); setDragOverId(a.id) } }}
          onDragLeave={() => { if (dragOverId === a.id) setDragOverId(null) }}
          onDrop={e => { e.preventDefault(); handleDrop(a.id) }}
          className={cn(
            'hover:bg-gray-50 cursor-pointer transition-colors',
            isChild && 'bg-gray-50/50',
            isDragOver && 'ring-2 ring-indigo-400 ring-inset bg-indigo-50',
            isDragging && 'opacity-50',
          )}
          onClick={() => setSelected(a)}
        >
          <td className="px-4 py-3 font-medium text-gray-900 max-w-xs">
            <div className={cn('flex items-center gap-1 truncate', isChild && 'pl-6')}>
              {isChild && (
                <span className="shrink-0 w-3 h-3 border-l-2 border-b-2 border-gray-300 rounded-bl -mt-2 mr-1" />
              )}
              {hasChildren && (
                <button
                  className="shrink-0 text-gray-400 hover:text-gray-700 p-0.5 rounded"
                  onClick={e => {
                    e.stopPropagation()
                    setExpanded(prev => {
                      const next = new Set(prev)
                      if (next.has(a.id)) { next.delete(a.id) } else { next.add(a.id) }
                      return next
                    })
                  }}
                >
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              )}
              <span className={cn('truncate', isChild && 'text-gray-600 font-normal')}>
                {a.title ?? '—'}
              </span>
              {hasChildren && (
                <span className="ml-1 shrink-0 text-xs text-gray-400 font-normal">({children.length})</span>
              )}
            </div>
          </td>
          <td className="px-4 py-3 text-gray-600">{a.contact_name ?? '—'}</td>
          <td className="px-4 py-3 text-gray-600">{a.account_name ?? '—'}</td>
          <td className="px-4 py-3">
            <span className={cn(
              'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
              a.owner === 'us' ? 'bg-indigo-100 text-indigo-700' : 'bg-orange-100 text-orange-700'
            )}>
              {a.owner === 'us' ? 'Us' : 'Client'}
            </span>
          </td>
          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(a.source_date)}</td>
          <td className="px-4 py-3 whitespace-nowrap">
            <span className={cn('font-semibold', daysLiveColor(days))}>{days}d</span>
          </td>
          <td className={cn('px-4 py-3 whitespace-nowrap', isOverdue ? 'text-red-600 font-medium' : 'text-gray-500')}>
            {formatDate(a.expected_by)}{a.expected_by_is_approximate && a.expected_by ? ' ~' : ''}
          </td>
          <td className="px-4 py-3">
            <StatusBadge status={a.status} />
          </td>
        </tr>
        {hasChildren && isExpanded && children.map(child => (
          <ActionRow key={child.id} a={child} isChild />
        ))}
      </>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">BD Actions</h1>
          <p className="text-gray-500 text-sm mt-0.5">{actions.length} action{actions.length !== 1 ? 's' : ''} tracked</p>
        </div>
        <Button onClick={() => setUploadOpen(true)}>
          <Plus className="w-4 h-4" />
          Import Meeting Summary
        </Button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard icon={<FileText className="w-5 h-5 text-indigo-600" />}  label="Total Open"       value={totalOpen}        color="bg-indigo-50" />
        <KpiCard icon={<Users    className="w-5 h-5 text-orange-600" />}  label="Awaiting Client"  value={awaitingClient}   color="bg-orange-50" />
        <KpiCard icon={<Clock    className="w-5 h-5 text-green-600"  />}  label="Avg Days Quiet"   value={`${avgDaysLive}d`} color="bg-green-50" />
        <KpiCard icon={<AlertTriangle className="w-5 h-5 text-red-600" />} label="Overdue"         value={overdue}          color="bg-red-50" />
      </div>
      {overdue > 0 && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span><strong>{overdue}</strong> action{overdue !== 1 ? 's are' : ' is'} past expected date</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search title, contact, account…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={account} onChange={(e) => setAccount(e.target.value)} placeholder="All Accounts" className="w-full sm:w-48">
          {accounts.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="w-full sm:w-36">
          <option value="All">All Owners</option>
          <option value="us">Us</option>
          <option value="them">Client</option>
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full sm:w-40">
          <option value="All">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select value={weight} onChange={(e) => setWeight(e.target.value)} className="w-full sm:w-40">
          <option value="All">All Weights</option>
          {WEIGHTS.map((w) => <option key={w} value={w}>{w}</option>)}
        </Select>
      </div>

      {/* Config error banner */}
      {fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800 flex items-start gap-2">
          <span className="font-semibold shrink-0">Error:</span>
          <span>{fetchError}</span>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">Loading actions…</p>
          </div>
        </div>
      ) : actions.length === 0 ? (
        <EmptyState onUpload={() => setUploadOpen(true)} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {dragId && (
            <div className="px-4 py-2 text-xs text-indigo-600 bg-indigo-50 border-b border-indigo-100">
              Drop onto an action to make it a parent
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  {([
                    { key: 'title',        label: 'Action' },
                    { key: 'contact_name', label: 'Contact' },
                    { key: 'account_name', label: 'Account' },
                    { key: 'owner',        label: 'Owner' },
                    { key: 'source_date',  label: 'Meeting' },
                    { key: 'days_live',    label: 'Days Quiet' },
                    { key: 'expected_by',  label: 'Expected By' },
                    { key: 'status',       label: 'Status' },
                  ] as { key: string; label: string }[]).map(({ key, label }) => (
                    <th
                      key={key}
                      className="px-4 py-3 cursor-pointer select-none hover:text-gray-800 whitespace-nowrap"
                      onClick={() => toggleSort(key)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {label}
                        <span className="text-gray-300">
                          {sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {roots.map((a) => (
                  <ActionRow key={a.id} a={a} isChild={false} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSaved={fetchActions}
      />

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

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className={cn('rounded-xl p-4 flex items-center gap-3', color)}>
      <div className="p-2 bg-white rounded-lg shadow-sm">{icon}</div>
      <div>
        <div className="text-xl font-bold text-gray-900">{value}</div>
        <div className="text-xs text-gray-500 font-medium">{label}</div>
      </div>
    </div>
  )
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-6xl mb-4">📋</div>
      <h3 className="text-lg font-semibold text-gray-800 mb-1">No actions yet</h3>
      <p className="text-gray-400 text-sm mb-6 max-w-xs">
        Import a meeting summary and Claude will extract every action item automatically.
      </p>
      <Button onClick={onUpload}>
        <Plus className="w-4 h-4" />
        Import your first meeting summary
      </Button>
    </div>
  )
}
