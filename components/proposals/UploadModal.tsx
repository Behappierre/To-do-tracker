'use client'

import { useState, useRef, DragEvent, ChangeEvent } from 'react'
import { Upload, FileText, Loader2, ChevronDown, ChevronUp, CheckSquare, Square } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { ExtractedProposal } from '@/types/proposal'
import { cn } from '@/lib/utils'

interface UploadModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

type Stage = 'drop' | 'reading' | 'extracting' | 'preview' | 'saving'

const STATUSES = ['Open', 'Followed Up', 'Responded', 'Closed', 'Stalled']

type DraftProposal = ExtractedProposal & { status: string; notes: string }

function emptyDraft(): DraftProposal {
  return {
    proposal_title: null, sender_name: null, recipient_name: null,
    recipient_company: null, proposal_date: null, summary: null,
    call_to_action: null, deadline: null, status: 'Open', notes: '',
  }
}

export function UploadModal({ open, onClose, onSaved }: UploadModalProps) {
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>('drop')
  const [dragging, setDragging] = useState(false)
  const [filename, setFilename] = useState('')
  const [pdfBase64, setPdfBase64] = useState('')
  const [drafts, setDrafts] = useState<DraftProposal[]>([])
  const [selected, setSelected] = useState<boolean[]>([])
  const [expanded, setExpanded] = useState<boolean[]>([])

  const reset = () => {
    setStage('drop'); setFilename(''); setPdfBase64('')
    setDrafts([]); setSelected([]); setExpanded([])
  }

  const handleClose = () => { reset(); onClose() }

  const processFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      toast('Only PDF files are supported', 'error')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => setPdfBase64((e.target?.result as string).split(',')[1])
    reader.readAsDataURL(file)

    setFilename(file.name)
    setStage('reading')

    const fd = new FormData()
    fd.append('pdf', file)

    try {
      setStage('extracting')
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const json = await res.json()

      if (!res.ok) {
        toast(json.error || 'Extraction failed', 'error')
        setStage('drop')
        return
      }

      const extracted: ExtractedProposal[] = json.proposals
      const d = extracted.map((e) => ({ ...emptyDraft(), ...e }))
      setDrafts(d)
      setSelected(d.map(() => true))
      setExpanded(d.map((_, i) => i === 0))
      setStage('preview')
    } catch {
      toast('Upload failed. Please try again.', 'error')
      setStage('drop')
    }
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const updateDraft = (index: number, key: keyof DraftProposal, value: string) => {
    setDrafts((prev) => prev.map((d, i) => i === index ? { ...d, [key]: value } : d))
  }

  const toggleSelect = (i: number) =>
    setSelected((prev) => prev.map((v, idx) => idx === i ? !v : v))

  const toggleExpand = (i: number) =>
    setExpanded((prev) => prev.map((v, idx) => idx === i ? !v : v))

  const handleSave = async () => {
    const toSave = drafts.filter((_, i) => selected[i])
    if (toSave.length === 0) { toast('Select at least one proposal to save', 'error'); return }

    setStage('saving')
    let savedCount = 0
    for (const draft of toSave) {
      try {
        const res = await fetch('/api/proposals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...draft, pdfBase64, pdf_filename: filename }),
        })
        if (res.ok) savedCount++
        else {
          const j = await res.json()
          toast(`Failed to save "${draft.proposal_title ?? 'proposal'}": ${j.error}`, 'error')
        }
      } catch {
        toast(`Network error saving "${draft.proposal_title ?? 'proposal'}"`, 'error')
      }
    }

    if (savedCount > 0) {
      toast(`${savedCount} proposal${savedCount !== 1 ? 's' : ''} saved`, 'success')
      reset(); onClose(); onSaved()
    } else {
      setStage('preview')
    }
  }

  const selectedCount = selected.filter(Boolean).length
  const stageLabel: Partial<Record<Stage, string>> = {
    reading: 'Reading PDF…', extracting: 'Extracting with AI…', saving: 'Saving…',
  }

  return (
    <Modal open={open} onClose={handleClose} title="Upload Proposal" className="max-w-2xl mx-4">
      <div className="p-6">
        {/* Drop zone */}
        {(stage === 'drop' || stage === 'reading' || stage === 'extracting') && (
          <div
            className={cn(
              'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors',
              dragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'
            )}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => stage === 'drop' && inputRef.current?.click()}
          >
            <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={onFileChange} />
            {stage === 'drop' ? (
              <>
                <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 font-medium">Drop a PDF here or click to browse</p>
                <p className="text-sm text-gray-400 mt-1">PDF files only · Multiple emails in one PDF are supported</p>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                <p className="text-gray-600 font-medium">{stageLabel[stage]}</p>
                {filename && <p className="text-sm text-gray-400">{filename}</p>}
              </div>
            )}
          </div>
        )}

        {/* Multi-proposal preview */}
        {stage === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-lg flex-1 mr-3 min-w-0">
                <FileText className="w-4 h-4 shrink-0" />
                <span className="truncate">{filename}</span>
              </div>
              <span className="text-sm font-medium text-indigo-600 shrink-0">
                {drafts.length} email{drafts.length !== 1 ? 's' : ''} found
              </span>
            </div>

            <p className="text-sm text-gray-500">
              Review and edit each extracted proposal. Uncheck any you don&apos;t want to save.
            </p>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {drafts.map((draft, i) => (
                <div
                  key={i}
                  className={cn(
                    'border rounded-xl transition-colors',
                    selected[i] ? 'border-indigo-200 bg-white' : 'border-gray-200 bg-gray-50 opacity-60'
                  )}
                >
                  {/* Accordion header */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      onClick={() => toggleSelect(i)}
                      className="text-indigo-600 shrink-0"
                      aria-label={selected[i] ? 'Deselect' : 'Select'}
                    >
                      {selected[i]
                        ? <CheckSquare className="w-5 h-5" />
                        : <Square className="w-5 h-5 text-gray-400" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">
                        {draft.proposal_title ?? `Proposal ${i + 1}`}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {[draft.recipient_name, draft.recipient_company].filter(Boolean).join(' · ') || 'Unknown recipient'}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleExpand(i)}
                      className="text-gray-400 hover:text-gray-600 shrink-0"
                    >
                      {expanded[i] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Expanded edit form */}
                  {expanded[i] && (
                    <div className="px-4 pb-4 space-y-3 border-t pt-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Title">
                          <Input value={draft.proposal_title ?? ''} onChange={(e) => updateDraft(i, 'proposal_title', e.target.value)} />
                        </Field>
                        <Field label="Sender Name">
                          <Input value={draft.sender_name ?? ''} onChange={(e) => updateDraft(i, 'sender_name', e.target.value)} />
                        </Field>
                        <Field label="Recipient Name">
                          <Input value={draft.recipient_name ?? ''} onChange={(e) => updateDraft(i, 'recipient_name', e.target.value)} />
                        </Field>
                        <Field label="Company">
                          <Input value={draft.recipient_company ?? ''} onChange={(e) => updateDraft(i, 'recipient_company', e.target.value)} />
                        </Field>
                        <Field label="Proposal Date">
                          <Input type="date" value={draft.proposal_date ?? ''} onChange={(e) => updateDraft(i, 'proposal_date', e.target.value)} />
                        </Field>
                        <Field label="Deadline">
                          <Input type="date" value={draft.deadline ?? ''} onChange={(e) => updateDraft(i, 'deadline', e.target.value)} />
                        </Field>
                      </div>
                      <Field label="Summary">
                        <Textarea rows={2} value={draft.summary ?? ''} onChange={(e) => updateDraft(i, 'summary', e.target.value)} />
                      </Field>
                      <Field label="Call to Action">
                        <Textarea rows={2} value={draft.call_to_action ?? ''} onChange={(e) => updateDraft(i, 'call_to_action', e.target.value)} />
                      </Field>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Status">
                          <Select value={draft.status} onChange={(e) => updateDraft(i, 'status', e.target.value)}>
                            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </Select>
                        </Field>
                        <Field label="Notes">
                          <Input value={draft.notes} onChange={(e) => updateDraft(i, 'notes', e.target.value)} />
                        </Field>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center pt-4 border-t">
              <span className="text-sm text-gray-500">
                {selectedCount} of {drafts.length} selected
              </span>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={handleClose}>Cancel</Button>
                <Button onClick={handleSave} disabled={selectedCount === 0}>
                  Save {selectedCount > 1 ? `${selectedCount} Proposals` : 'Proposal'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {stage === 'saving' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            <p className="text-gray-600 font-medium">Saving…</p>
          </div>
        )}
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}
