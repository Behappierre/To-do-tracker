'use client'

import { useState, useEffect, ReactNode } from 'react'
import { X, ExternalLink, Trash2, Calendar, Building2, User, Bell } from 'lucide-react'
import { Action, ActionStatus, ActionOwner, StrategicWeight } from '@/types/proposal'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { formatDate, daysLiveBg, cn } from '@/lib/utils'

interface DrawerProps {
  proposal: Action | null
  proposals: Action[]
  onClose: () => void
  onUpdated: (p: Action) => void
  onDeleted: (id: string) => void
}

const STATUSES: ActionStatus[] = ['Open', 'Nudged', 'In Progress', 'Done', 'Stalled', 'Superseded']
const WEIGHTS: StrategicWeight[] = ['Low', 'Medium', 'Medium-High', 'High']

export function ProposalDrawer({ proposal, proposals, onClose, onUpdated, onDeleted }: DrawerProps) {
  const { toast } = useToast()
  const [status, setStatus]                     = useState<ActionStatus>('Open')
  const [owner, setOwner]                       = useState<ActionOwner>('them')
  const [notes, setNotes]                       = useState('')
  const [expectedBy, setExpectedBy]             = useState('')
  const [expectedByApprox, setExpectedByApprox] = useState(false)
  const [strategicWeight, setStrategicWeight]   = useState<StrategicWeight | ''>('')
  const [dependencies, setDependencies]         = useState('')
  const [parallelRoute, setParallelRoute]       = useState('')
  const [parentId, setParentId]                 = useState<string>('')
  const [saving, setSaving]                     = useState(false)
  const [confirmDelete, setConfirmDelete]       = useState(false)

  useEffect(() => {
    if (proposal) {
      setStatus(proposal.status)
      setOwner(proposal.owner ?? 'them')
      setNotes(proposal.notes ?? '')
      setExpectedBy(proposal.expected_by ?? '')
      setExpectedByApprox(proposal.expected_by_is_approximate ?? false)
      setStrategicWeight((proposal.strategic_weight as StrategicWeight) ?? '')
      setDependencies(proposal.dependencies ?? '')
      setParallelRoute(proposal.parallel_route ?? '')
      setParentId(proposal.parent_id ?? '')
      setConfirmDelete(false)
    }
  }, [proposal])

  if (!proposal) return null

  const days = proposal.days_live ?? 0

  const parentOptions = proposals.filter(p => p.id !== proposal.id && !p.parent_id)
  const hasChildren   = proposals.some(p => p.parent_id === proposal.id)

  const patch = async (body: Record<string, unknown>) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/proposals/${proposal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { toast(json.error || 'Update failed', 'error'); return null }
      return json
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async () => {
    const json = await patch({
      status,
      owner,
      notes,
      expected_by: expectedBy || null,
      expected_by_is_approximate: expectedByApprox,
      strategic_weight: strategicWeight || null,
      dependencies: dependencies || null,
      parallel_route: parallelRoute || null,
      parent_id: parentId || null,
    })
    if (json) { toast('Action updated', 'success'); onUpdated(json) }
  }

  const handleMarkNudged = async () => {
    const json = await patch({ status: 'Nudged' })
    if (json) { toast('Marked as Nudged — days live reset', 'success'); onUpdated(json) }
  }

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/proposals/${proposal.id}`, { method: 'DELETE' })
      if (!res.ok) { toast('Delete failed', 'error'); return }
      toast('Action deleted', 'success')
      onDeleted(proposal.id)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const ownerLabel = proposal.owner === 'us' ? 'Our team' : 'Client side'
  const ownerColor = proposal.owner === 'us' ? 'bg-indigo-100 text-indigo-800' : 'bg-orange-100 text-orange-800'

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-xl bg-white z-50 shadow-2xl overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b sticky top-0 bg-white z-10">
          <div className="flex-1 pr-4">
            <h2 className="font-semibold text-gray-900 text-lg leading-tight">
              {proposal.title ?? 'Untitled Action'}
            </h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <StatusBadge status={proposal.status} />
              <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', ownerColor)}>
                {ownerLabel}
              </span>
              {proposal.strategic_weight && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                  {proposal.strategic_weight}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 rounded-lg p-1 mt-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 px-6 py-5 space-y-6">
          {/* Days live */}
          <div className={cn('rounded-xl p-4 flex items-center justify-between gap-4', daysLiveBg(days))}>
            <div className="flex items-center gap-4">
              <div>
                <div className="text-3xl font-bold">{days}</div>
                <div className="text-sm font-medium opacity-80">days since last update</div>
              </div>
              <div className="text-sm opacity-75 leading-relaxed">
                {days < 14 ? 'Recently touched.' : days <= 30 ? 'Consider a nudge.' : 'This is going quiet — take action!'}
              </div>
            </div>
            {proposal.status !== 'Done' && proposal.status !== 'Superseded' && (
              <button
                onClick={handleMarkNudged}
                disabled={saving}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/60 hover:bg-white text-sm font-medium transition-colors disabled:opacity-50"
                title="Mark as Nudged — resets days live counter"
              >
                <Bell className="w-3.5 h-3.5" />
                Mark nudged
              </button>
            )}
          </div>

          {/* Meta */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <InfoRow icon={<User className="w-4 h-4" />} label="Contact" value={proposal.contact_name} />
            <InfoRow icon={<Building2 className="w-4 h-4" />} label="Account" value={proposal.account_name} />
            <InfoRow icon={<Calendar className="w-4 h-4" />} label="Meeting Date" value={formatDate(proposal.source_date)} />
            <InfoRow
              icon={<Calendar className="w-4 h-4" />}
              label="Expected By"
              value={proposal.expected_by
                ? `${formatDate(proposal.expected_by)}${proposal.expected_by_is_approximate ? ' (approx)' : ''}`
                : null}
            />
          </div>

          {/* Summary */}
          {proposal.summary && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Context</p>
              <p className="text-sm text-gray-700 leading-relaxed">{proposal.summary}</p>
            </div>
          )}

          {/* Dependencies */}
          {proposal.dependencies && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Dependencies</p>
              <p className="text-sm text-gray-700 leading-relaxed">{proposal.dependencies}</p>
            </div>
          )}

          {/* Editable fields */}
          <div className="space-y-4 pt-2 border-t">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</label>
                <Select value={status} onChange={(e) => setStatus(e.target.value as ActionStatus)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Owner</label>
                <Select value={owner} onChange={(e) => setOwner(e.target.value as ActionOwner)}>
                  <option value="us">Us (our team)</option>
                  <option value="them">Them (client)</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Expected By</label>
                <Input
                  type="date"
                  value={expectedBy}
                  onChange={(e) => setExpectedBy(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Date is Approximate</label>
                <div className="flex items-center h-9 gap-2">
                  <input
                    type="checkbox"
                    id="approx"
                    checked={expectedByApprox}
                    onChange={(e) => setExpectedByApprox(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600"
                  />
                  <label htmlFor="approx" className="text-sm text-gray-600">Approximate</label>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Strategic Weight</label>
              <Select value={strategicWeight} onChange={(e) => setStrategicWeight(e.target.value as StrategicWeight | '')}>
                <option value="">— Not set —</option>
                {WEIGHTS.map((w) => <option key={w} value={w}>{w}</option>)}
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Dependencies</label>
              <Textarea
                rows={2}
                placeholder="What is this blocked on?"
                value={dependencies}
                onChange={(e) => setDependencies(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Parallel Route</label>
              <Textarea
                rows={2}
                placeholder="Alternative path if this stalls…"
                value={parallelRoute}
                onChange={(e) => setParallelRoute(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notes</label>
              <Textarea
                rows={3}
                placeholder="Add your notes here…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Parent Action</label>
              {hasChildren ? (
                <p className="text-xs text-gray-400 italic py-1">
                  This action has sub-actions and cannot itself be a child.
                </p>
              ) : (
                <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                  <option value="">— None —</option>
                  {parentOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title ?? 'Untitled'}{p.account_name ? ` (${p.account_name})` : ''}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          </div>

          {proposal.pdf_url && (
            <a
              href={proposal.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-indigo-600 hover:underline"
            >
              <ExternalLink className="w-4 h-4" />
              Open source document
            </a>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-white flex items-center justify-between">
          <Button variant="danger" size="sm" onClick={handleDelete} disabled={saving}>
            <Trash2 className="w-4 h-4" />
            {confirmDelete ? 'Click again to confirm' : 'Delete'}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </>
  )
}

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide flex items-center gap-1">
        {icon}{label}
      </p>
      <p className="text-gray-800 font-medium">{value ?? '—'}</p>
    </div>
  )
}
