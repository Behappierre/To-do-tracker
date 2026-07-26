'use client'

import { useState, useRef, useEffect, DragEvent, ChangeEvent } from 'react'
import { Upload, FileText, Loader2, ChevronDown, ChevronUp, CheckSquare, Square, ClipboardPaste } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import {
  ExtractedAction,
  ActionStatus,
  ActionOwner,
  StrategicWeight,
  EntityOptions,
} from '@/types/proposal'
import { cn } from '@/lib/utils'

interface UploadModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

type Stage = 'drop' | 'reading' | 'extracting' | 'preview' | 'saving'
type InputMode = 'pdf' | 'text'

const STATUSES: ActionStatus[]       = ['Open', 'Nudged', 'In Progress', 'Done', 'Stalled', 'Superseded']
const WEIGHTS: StrategicWeight[]     = ['Low', 'Medium', 'Medium-High', 'High']

type DraftAction = ExtractedAction & {
  notes: string
  company_id: string | null
  primary_stakeholder_id: string | null
}

function emptyDraft(): DraftAction {
  return {
    title: null, account_name: null, contact_name: null,
    owner: 'them', source_date: null, expected_by: null,
    expected_by_is_approximate: false, strategic_weight: null,
    dependencies: null, summary: null, status: 'Open', notes: '',
    company_id: null, primary_stakeholder_id: null,
  }
}

export function UploadModal({ open, onClose, onSaved }: UploadModalProps) {
  const { toast }   = useToast()
  const inputRef    = useRef<HTMLInputElement>(null)
  const [mode, setMode]         = useState<InputMode>('pdf')
  const [stage, setStage]       = useState<Stage>('drop')
  const [dragging, setDragging] = useState(false)
  const [filename, setFilename] = useState('')
  const [pdfBase64, setPdfBase64]   = useState('')
  const [pasteText, setPasteText]   = useState('')
  const [drafts, setDrafts]         = useState<DraftAction[]>([])
  const [selected, setSelected]     = useState<boolean[]>([])
  const [expanded, setExpanded]     = useState<boolean[]>([])
  const [entities, setEntities]     = useState<EntityOptions>({ companies: [], stakeholders: [] })

  useEffect(() => {
    if (!open || entities.companies.length > 0) return

    fetch('/api/entity-options')
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load companies and stakeholders')
        return res.json()
      })
      .then(setEntities)
      .catch(() => toast('Company and stakeholder links are temporarily unavailable', 'error'))
  }, [open, entities.companies.length, toast])

  const reset = () => {
    setStage('drop'); setFilename(''); setPdfBase64(''); setPasteText('')
    setDrafts([]); setSelected([]); setExpanded([])
  }

  const handleClose = () => { reset(); onClose() }

  const runExtraction = async (fd: FormData, fname: string) => {
    setFilename(fname)
    setStage('extracting')
    try {
      const res  = await fetch('/api/upload', { method: 'POST', body: fd })
      const json = await res.json()

      if (!res.ok) {
        toast(json.error || 'Extraction failed', 'error')
        setStage('drop')
        return
      }

      const extracted: ExtractedAction[] = json.proposals
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

  const processFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      toast('Only PDF files are supported', 'error')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => setPdfBase64((e.target?.result as string).split(',')[1])
    reader.readAsDataURL(file)

    setStage('reading')
    const fd = new FormData()
    fd.append('pdf', file)
    await runExtraction(fd, file.name)
  }

  const processText = async () => {
    if (!pasteText.trim()) { toast('Paste your meeting summary first', 'error'); return }
    const fd = new FormData()
    fd.append('text', pasteText.trim())
    await runExtraction(fd, 'meeting-summary')
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

  const updateDraft = (index: number, key: keyof DraftAction, value: unknown) => {
    setDrafts((prev) => prev.map((d, i) => i === index ? { ...d, [key]: value } : d))
  }

  const selectCompany = (index: number, companyId: string) => {
    const company = entities.companies.find((option) => option.id === companyId)
    setDrafts((prev) => prev.map((draft, i) => i === index ? {
      ...draft,
      company_id: companyId || null,
      account_name: company?.name ?? draft.account_name,
      primary_stakeholder_id:
        entities.stakeholders.some((stakeholder) =>
          stakeholder.id === draft.primary_stakeholder_id &&
          stakeholder.company_id === companyId
        )
          ? draft.primary_stakeholder_id
          : null,
    } : draft))
  }

  const selectStakeholder = (index: number, stakeholderId: string) => {
    const stakeholder = entities.stakeholders.find((option) => option.id === stakeholderId)
    const company = stakeholder
      ? entities.companies.find((option) => option.id === stakeholder.company_id)
      : null
    setDrafts((prev) => prev.map((draft, i) => i === index ? {
      ...draft,
      primary_stakeholder_id: stakeholderId || null,
      contact_name: stakeholder?.full_name ?? draft.contact_name,
      company_id: stakeholder?.company_id ?? draft.company_id,
      account_name: company?.name ?? draft.account_name,
    } : draft))
  }

  const toggleSelect = (i: number) =>
    setSelected((prev) => prev.map((v, idx) => idx === i ? !v : v))

  const toggleExpand = (i: number) =>
    setExpanded((prev) => prev.map((v, idx) => idx === i ? !v : v))

  const handleSave = async () => {
    const toSave = drafts.filter((_, i) => selected[i])
    if (toSave.length === 0) { toast('Select at least one action to save', 'error'); return }

    setStage('saving')
    let savedCount = 0
    for (const draft of toSave) {
      try {
        const body: Record<string, unknown> = { ...draft }
        if (pdfBase64) { body.pdfBase64 = pdfBase64; body.pdf_filename = filename }
        const res = await fetch('/api/proposals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (res.ok) savedCount++
        else {
          const j = await res.json()
          toast(`Failed to save "${draft.title ?? 'action'}": ${j.error}`, 'error')
        }
      } catch {
        toast(`Network error saving "${draft.title ?? 'action'}"`, 'error')
      }
    }

    if (savedCount > 0) {
      toast(`${savedCount} action${savedCount !== 1 ? 's' : ''} saved`, 'success')
      reset(); onClose(); onSaved()
    } else {
      setStage('preview')
    }
  }

  const selectedCount = selected.filter(Boolean).length
  const stageLabel: Partial<Record<Stage, string>> = {
    reading: 'Reading PDF…', extracting: 'Extracting with AI…', saving: 'Saving…',
  }
  const isProcessing = stage === 'reading' || stage === 'extracting'

  return (
    <Modal open={open} onClose={handleClose} title="Import Meeting Summary" className="max-w-2xl mx-4">
      <div className="p-6">
        {/* Input mode tabs (only shown before extraction) */}
        {(stage === 'drop' || isProcessing) && (
          <div className="flex rounded-lg border border-gray-200 p-1 gap-1 mb-4">
            <button
              onClick={() => setMode('pdf')}
              className={cn('flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm font-medium transition-colors', mode === 'pdf' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50')}
            >
              <Upload className="w-4 h-4" /> PDF Upload
            </button>
            <button
              onClick={() => setMode('text')}
              className={cn('flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm font-medium transition-colors', mode === 'text' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50')}
            >
              <ClipboardPaste className="w-4 h-4" /> Paste Text
            </button>
          </div>
        )}

        {/* PDF drop zone */}
        {(stage === 'drop' || isProcessing) && mode === 'pdf' && (
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
                <p className="text-sm text-gray-400 mt-1">PDF files only</p>
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

        {/* Text paste zone */}
        {(stage === 'drop' || isProcessing) && mode === 'text' && (
          <div className="space-y-3">
            <Textarea
              rows={12}
              placeholder="Paste your meeting summary here (Meeting Context, Substantive Summary, Actions and Next Steps…)"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              disabled={isProcessing}
              className="font-mono text-xs"
            />
            {isProcessing ? (
              <div className="flex items-center justify-center gap-3 py-4">
                <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                <p className="text-gray-600 font-medium">{stageLabel[stage]}</p>
              </div>
            ) : (
              <Button onClick={processText} className="w-full" disabled={!pasteText.trim()}>
                Extract Actions with AI
              </Button>
            )}
          </div>
        )}

        {/* Multi-action preview */}
        {stage === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-lg flex-1 mr-3 min-w-0">
                <FileText className="w-4 h-4 shrink-0" />
                <span className="truncate">{filename}</span>
              </div>
              <span className="text-sm font-medium text-indigo-600 shrink-0">
                {drafts.length} action{drafts.length !== 1 ? 's' : ''} found
              </span>
            </div>

            <p className="text-sm text-gray-500">
              Review and edit each extracted action. Uncheck any you don&apos;t want to save.
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
                        {draft.title ?? `Action ${i + 1}`}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {[draft.contact_name, draft.account_name].filter(Boolean).join(' · ') || 'Unknown contact'}
                        {draft.owner === 'us'
                          ? ' · 🔵 Us'
                          : ' · 🟠 Client'}
                      </p>
                    </div>
                    <button onClick={() => toggleExpand(i)} className="text-gray-400 hover:text-gray-600 shrink-0">
                      {expanded[i] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>

                  {expanded[i] && (
                    <div className="px-4 pb-4 space-y-3 border-t pt-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Title">
                          <Input value={draft.title ?? ''} onChange={(e) => updateDraft(i, 'title', e.target.value)} />
                        </Field>
                        <Field label="Linked Company">
                          <Select value={draft.company_id ?? ''} onChange={(e) => selectCompany(i, e.target.value)}>
                            <option value="">— Not linked —</option>
                            {entities.companies.map((company) => (
                              <option key={company.id} value={company.id}>{company.name}</option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Linked Stakeholder">
                          <Select
                            value={draft.primary_stakeholder_id ?? ''}
                            onChange={(e) => selectStakeholder(i, e.target.value)}
                          >
                            <option value="">— Not linked —</option>
                            {entities.stakeholders
                              .filter((stakeholder) =>
                                !draft.company_id || stakeholder.company_id === draft.company_id
                              )
                              .map((stakeholder) => (
                                <option key={stakeholder.id} value={stakeholder.id}>
                                  {stakeholder.full_name}{stakeholder.title ? ` — ${stakeholder.title}` : ''}
                                </option>
                              ))}
                          </Select>
                        </Field>
                        <Field label="Account">
                          <Input value={draft.account_name ?? ''} onChange={(e) => updateDraft(i, 'account_name', e.target.value)} />
                        </Field>
                        <Field label="Contact Name">
                          <Input value={draft.contact_name ?? ''} onChange={(e) => updateDraft(i, 'contact_name', e.target.value)} />
                        </Field>
                        <Field label="Owner">
                          <Select value={draft.owner} onChange={(e) => updateDraft(i, 'owner', e.target.value as ActionOwner)}>
                            <option value="us">Us (our team)</option>
                            <option value="them">Them (client)</option>
                          </Select>
                        </Field>
                        <Field label="Meeting Date">
                          <Input type="date" value={draft.source_date ?? ''} onChange={(e) => updateDraft(i, 'source_date', e.target.value)} />
                        </Field>
                        <Field label="Expected By">
                          <Input type="date" value={draft.expected_by ?? ''} onChange={(e) => updateDraft(i, 'expected_by', e.target.value)} />
                        </Field>
                        <Field label="Strategic Weight">
                          <Select value={draft.strategic_weight ?? ''} onChange={(e) => updateDraft(i, 'strategic_weight', e.target.value as StrategicWeight || null)}>
                            <option value="">— Not set —</option>
                            {WEIGHTS.map((w) => <option key={w} value={w}>{w}</option>)}
                          </Select>
                        </Field>
                        <Field label="Status">
                          <Select value={draft.status} onChange={(e) => updateDraft(i, 'status', e.target.value as ActionStatus)}>
                            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </Select>
                        </Field>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="checkbox"
                          id={`approx-${i}`}
                          checked={draft.expected_by_is_approximate}
                          onChange={(e) => updateDraft(i, 'expected_by_is_approximate', e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-indigo-600"
                        />
                        <label htmlFor={`approx-${i}`} className="text-xs text-gray-500">Expected by date is approximate</label>
                      </div>
                      <Field label="Dependencies">
                        <Input value={draft.dependencies ?? ''} onChange={(e) => updateDraft(i, 'dependencies', e.target.value)} />
                      </Field>
                      <Field label="Context / Summary">
                        <Textarea rows={2} value={draft.summary ?? ''} onChange={(e) => updateDraft(i, 'summary', e.target.value)} />
                      </Field>
                      <Field label="Notes">
                        <Input value={draft.notes} onChange={(e) => updateDraft(i, 'notes', e.target.value)} />
                      </Field>
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
                  Save {selectedCount > 1 ? `${selectedCount} Actions` : 'Action'}
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
