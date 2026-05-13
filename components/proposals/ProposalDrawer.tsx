'use client'

import { useState, useEffect, ReactNode } from 'react'
import { X, ExternalLink, Trash2, Calendar, Building2, User } from 'lucide-react'
import { Proposal, ProposalStatus } from '@/types/proposal'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { formatDate, daysLiveBg, cn } from '@/lib/utils'

interface DrawerProps {
  proposal: Proposal | null
  onClose: () => void
  onUpdated: (p: Proposal) => void
  onDeleted: (id: string) => void
}

const STATUSES: ProposalStatus[] = ['Open', 'Followed Up', 'Responded', 'Closed', 'Stalled']

export function ProposalDrawer({ proposal, onClose, onUpdated, onDeleted }: DrawerProps) {
  const { toast } = useToast()
  const [status, setStatus] = useState<ProposalStatus>('Open')
  const [notes, setNotes] = useState('')
  const [deadline, setDeadline] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (proposal) {
      setStatus(proposal.status)
      setNotes(proposal.notes ?? '')
      setDeadline(proposal.deadline ?? '')
      setConfirmDelete(false)
    }
  }, [proposal])

  if (!proposal) return null

  const days = proposal.days_live ?? 0

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/proposals/${proposal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes, deadline: deadline || null }),
      })
      const json = await res.json()
      if (!res.ok) { toast(json.error || 'Update failed', 'error'); return }
      toast('Proposal updated', 'success')
      onUpdated(json)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/proposals/${proposal.id}`, { method: 'DELETE' })
      if (!res.ok) { toast('Delete failed', 'error'); return }
      toast('Proposal deleted', 'success')
      onDeleted(proposal.id)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-xl bg-white z-50 shadow-2xl overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b sticky top-0 bg-white z-10">
          <div className="flex-1 pr-4">
            <h2 className="font-semibold text-gray-900 text-lg leading-tight">
              {proposal.proposal_title ?? 'Untitled Proposal'}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={proposal.status} />
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 rounded-lg p-1 mt-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 px-6 py-5 space-y-6">
          {/* Days live */}
          <div className={cn('rounded-xl p-4 flex items-center gap-4', daysLiveBg(days))}>
            <div>
              <div className="text-3xl font-bold">{days}</div>
              <div className="text-sm font-medium opacity-80">days live</div>
            </div>
            <div className="text-sm opacity-75 leading-relaxed">
              {days < 14 ? 'Fresh proposal — keep it warm.' : days <= 30 ? 'Time for a follow-up.' : 'Proposal is ageing — take action!'}
            </div>
          </div>

          {/* Meta */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <InfoRow icon={<User className="w-4 h-4" />} label="Sender" value={proposal.sender_name} />
            <InfoRow icon={<User className="w-4 h-4" />} label="Recipient" value={proposal.recipient_name} />
            <InfoRow icon={<Building2 className="w-4 h-4" />} label="Company" value={proposal.recipient_company} />
            <InfoRow icon={<Calendar className="w-4 h-4" />} label="Proposal Date" value={formatDate(proposal.proposal_date)} />
          </div>

          {/* Summary */}
          {proposal.summary && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Summary</p>
              <p className="text-sm text-gray-700 leading-relaxed">{proposal.summary}</p>
            </div>
          )}

          {/* Call to action */}
          {proposal.call_to_action && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Call to Action</p>
              <p className="text-sm text-gray-700 leading-relaxed">{proposal.call_to_action}</p>
            </div>
          )}

          {/* Editable fields */}
          <div className="space-y-4 pt-2 border-t">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</label>
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProposalStatus)}
              >
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Deadline</label>
              <Input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notes</label>
              <Textarea
                rows={4}
                placeholder="Add your notes here…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {/* PDF link */}
          {proposal.pdf_url && (
            <a
              href={proposal.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-indigo-600 hover:underline"
            >
              <ExternalLink className="w-4 h-4" />
              Open original PDF
            </a>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-white flex items-center justify-between">
          <Button
            variant="danger"
            size="sm"
            onClick={handleDelete}
            disabled={saving}
          >
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

