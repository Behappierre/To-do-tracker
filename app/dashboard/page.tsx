'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, FileText, TrendingUp, Clock, AlertTriangle, Users } from 'lucide-react'
import { Proposal } from '@/types/proposal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { StatusBadge } from '@/components/ui/badge'
import { UploadModal } from '@/components/proposals/UploadModal'
import { ProposalDrawer } from '@/components/proposals/ProposalDrawer'
import { formatDate, daysLiveColor, cn } from '@/lib/utils'
import { differenceInDays, parseISO, compareAsc } from 'date-fns'

const STATUSES = ['All', 'Open', 'Followed Up', 'Responded', 'Closed', 'Stalled']

export default function DashboardPage() {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [company, setCompany] = useState('')
  const [status, setStatus] = useState('All')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selected, setSelected] = useState<Proposal | null>(null)
  const [sortKey, setSortKey] = useState<string>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const fetchProposals = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (company) params.set('company', company)
      if (status !== 'All') params.set('status', status)
      const res = await fetch(`/api/proposals?${params}`)
      const data = await res.json()
      if (!res.ok) { setFetchError(data.error || 'Failed to load proposals'); setProposals([]); return }
      setProposals(Array.isArray(data) ? data : [])
    } catch {
      setFetchError('Network error — is the server running?')
    } finally {
      setLoading(false)
    }
  }, [search, company, status])

  useEffect(() => { fetchProposals() }, [fetchProposals])

  const companies = Array.from(new Set(proposals.map((p) => p.recipient_company).filter(Boolean))) as string[]

  const today = new Date()
  const totalOpen = proposals.filter((p) => p.status === 'Open').length
  const totalFollowedUp = proposals.filter((p) => p.status === 'Followed Up').length
  const avgDaysLive = proposals.length
    ? Math.round(proposals.reduce((s, p) => s + (p.days_live ?? 0), 0) / proposals.length)
    : 0
  const overdue = proposals.filter(
    (p) => p.deadline && ['Open', 'Followed Up', 'Stalled'].includes(p.status) &&
      differenceInDays(today, parseISO(p.deadline)) > 0
  ).length

  const handleUpdated = (updated: Proposal) => {
    setProposals((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
    setSelected(updated)
  }

  const handleDeleted = (id: string) => {
    setProposals((prev) => prev.filter((p) => p.id !== id))
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

  const sorted = [...proposals].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'proposal_title') {
      cmp = (a.proposal_title ?? '').localeCompare(b.proposal_title ?? '')
    } else if (sortKey === 'recipient_name') {
      cmp = (a.recipient_name ?? '').localeCompare(b.recipient_name ?? '')
    } else if (sortKey === 'recipient_company') {
      cmp = (a.recipient_company ?? '').localeCompare(b.recipient_company ?? '')
    } else if (sortKey === 'proposal_date') {
      cmp = a.proposal_date && b.proposal_date
        ? compareAsc(parseISO(a.proposal_date), parseISO(b.proposal_date))
        : (a.proposal_date ? 1 : -1)
    } else if (sortKey === 'days_live') {
      cmp = (a.days_live ?? 0) - (b.days_live ?? 0)
    } else if (sortKey === 'deadline') {
      cmp = a.deadline && b.deadline
        ? compareAsc(parseISO(a.deadline), parseISO(b.deadline))
        : (a.deadline ? 1 : -1)
    } else if (sortKey === 'status') {
      cmp = a.status.localeCompare(b.status)
    } else {
      cmp = compareAsc(parseISO(a.created_at), parseISO(b.created_at))
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">{proposals.length} proposal{proposals.length !== 1 ? 's' : ''} tracked</p>
        </div>
        <Button onClick={() => setUploadOpen(true)}>
          <Plus className="w-4 h-4" />
          Upload Proposal
        </Button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard icon={<FileText className="w-5 h-5 text-indigo-600" />} label="Total" value={proposals.length} color="bg-indigo-50" />
        <KpiCard icon={<TrendingUp className="w-5 h-5 text-blue-600" />} label="Open" value={totalOpen} color="bg-blue-50" />
        <KpiCard icon={<Users className="w-5 h-5 text-yellow-600" />} label="Followed Up" value={totalFollowedUp} color="bg-yellow-50" />
        <KpiCard icon={<Clock className="w-5 h-5 text-green-600" />} label="Avg Days Live" value={`${avgDaysLive}d`} color="bg-green-50" />
        {overdue > 0 && (
          <div className="col-span-2 sm:col-span-4">
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span><strong>{overdue}</strong> proposal{overdue !== 1 ? 's are' : ' is'} overdue (past deadline)</span>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search title, recipient, company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="All Companies"
          className="w-full sm:w-48"
        >
          {companies.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full sm:w-40"
        >
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
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
            <p className="text-gray-400 text-sm">Loading proposals…</p>
          </div>
        </div>
      ) : proposals.length === 0 ? (
        <EmptyState onUpload={() => setUploadOpen(true)} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  {([
                    { key: 'proposal_title', label: 'Title' },
                    { key: 'recipient_name', label: 'Recipient' },
                    { key: 'recipient_company', label: 'Company' },
                    { key: 'proposal_date', label: 'Sent' },
                    { key: 'days_live', label: 'Days Live' },
                    { key: 'deadline', label: 'Deadline' },
                    { key: 'status', label: 'Status' },
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
                {sorted.map((p) => {
                  const days = p.days_live ?? 0
                  const isOverdue = p.deadline &&
                    ['Open', 'Followed Up', 'Stalled'].includes(p.status) &&
                    differenceInDays(today, parseISO(p.deadline)) > 0
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => setSelected(p)}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">
                        {p.proposal_title ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{p.recipient_name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{p.recipient_company ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(p.proposal_date)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={cn('font-semibold', daysLiveColor(days))}>{days}d</span>
                      </td>
                      <td className={cn('px-4 py-3 whitespace-nowrap', isOverdue ? 'text-red-600 font-medium' : 'text-gray-500')}>
                        {formatDate(p.deadline)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={p.status} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSaved={fetchProposals}
      />

      {selected && (
        <ProposalDrawer
          proposal={selected}
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
      <div className="text-6xl mb-4">📬</div>
      <h3 className="text-lg font-semibold text-gray-800 mb-1">No proposals yet</h3>
      <p className="text-gray-400 text-sm mb-6 max-w-xs">
        Upload your first PDF proposal and Claude will extract the key details automatically.
      </p>
      <Button onClick={onUpload}>
        <Plus className="w-4 h-4" />
        Upload your first proposal
      </Button>
    </div>
  )
}
