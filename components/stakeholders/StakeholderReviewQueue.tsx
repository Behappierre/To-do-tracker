'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CirclePause,
  LockKeyhole,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import type {
  DuplicateResolution,
  StakeholderDuplicateGroup,
  StakeholderDuplicateReviewItem,
  SuggestedResolution,
} from '@/types/stakeholder-review'

interface StakeholderReviewQueueProps {
  groups: StakeholderDuplicateGroup[]
  loadError: string | null
  resolutionEnabled: boolean
}

interface FieldDefinition {
  key: keyof StakeholderDuplicateReviewItem
  label: string
  format?: (value: unknown) => string
}

const COMPARISON_FIELDS: FieldDefinition[] = [
  { key: 'title', label: 'Job title' },
  { key: 'department', label: 'Department' },
  {
    key: 'seniority_level',
    label: 'Seniority',
    format: (value) => formatEnum(value),
  },
  { key: 'influence_score', label: 'Influence' },
  { key: 'sentiment', label: 'Sentiment', format: (value) => formatEnum(value) },
  { key: 'sentiment_confidence', label: 'Sentiment confidence' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'linkedin_url', label: 'LinkedIn' },
  { key: 'source_status', label: 'Source status', format: (value) => formatEnum(value) },
  { key: 'notes', label: 'Notes' },
  {
    key: 'source_created_at',
    label: 'Created',
    format: (value) => formatDate(value),
  },
  {
    key: 'source_updated_at',
    label: 'Updated',
    format: (value) => formatDate(value),
  },
]

const RESOLUTION_LABELS: Record<DuplicateResolution, string> = {
  merge: 'Merge records',
  keep_separate: 'Keep separate',
  dismissed: 'Dismiss group',
}

function formatEnum(value: unknown) {
  return typeof value === 'string'
    ? value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
    : displayValue(value)
}

function formatDate(value: unknown) {
  if (typeof value !== 'string' || !value) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

function fieldValue(item: StakeholderDuplicateReviewItem, field: FieldDefinition) {
  const value = item[field.key]
  return field.format ? field.format(value) : displayValue(value)
}

function hasDifferentValues(
  items: StakeholderDuplicateReviewItem[],
  field: FieldDefinition
) {
  return new Set(items.map((item) => fieldValue(item, field))).size > 1
}

function suggestionLabel(suggestion: SuggestedResolution) {
  return suggestion === 'merge_likely' ? 'Likely merge' : 'Manual review'
}

export function StakeholderReviewQueue({
  groups: initialGroups,
  loadError,
  resolutionEnabled,
}: StakeholderReviewQueueProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [groups, setGroups] = useState(initialGroups)
  const [search, setSearch] = useState('')
  const [suggestion, setSuggestion] = useState<'all' | SuggestedResolution>('all')
  const [company, setCompany] = useState('all')
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(
    () => new Set(initialGroups.map((group) => group.groupId))
  )

  const companies = useMemo(
    () => Array.from(new Set(groups.map((group) => group.companyName))).sort(),
    [groups]
  )

  const filteredGroups = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return groups.filter((group) => {
      if (suggestion !== 'all' && group.suggestedResolution !== suggestion) return false
      if (company !== 'all' && group.companyName !== company) return false
      if (!normalizedSearch) return true
      return `${group.companyName} ${group.fullName}`
        .toLowerCase()
        .includes(normalizedSearch)
    })
  }, [company, groups, search, suggestion])

  const mergeLikelyCount = groups.filter(
    (group) => group.suggestedResolution === 'merge_likely'
  ).length
  const manualReviewCount = groups.length - mergeLikelyCount

  function toggleGroup(groupId: number) {
    setExpandedGroups((current) => {
      const next = new Set(current)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  function handleResolved(groupId: number) {
    setGroups((current) => current.filter((group) => group.groupId !== groupId))
    toast('Duplicate group resolved', 'success')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-indigo-700">
            <ShieldCheck className="h-4 w-4" />
            Administrator data review
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Stakeholder duplicate review</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            Compare imported StakeMap records before they enter the shared stakeholder
            register. Recommendations are advisory; nothing is merged automatically.
          </p>
        </div>
        <div
          className={cn(
            'flex max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm',
            resolutionEnabled
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          )}
        >
          {resolutionEnabled ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div>
            <div className="font-semibold">
              {resolutionEnabled ? 'Resolution enabled' : 'Validation-only mode'}
            </div>
            <div className="mt-0.5 text-xs opacity-80">
              {resolutionEnabled
                ? 'Confirmed decisions can update the canonical register.'
                : 'You can compare and prepare decisions, but live data cannot be changed.'}
            </div>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">The review queue could not be loaded.</div>
            <div className="mt-0.5 text-xs">{loadError}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          icon={<UsersRound className="h-5 w-5 text-indigo-600" />}
          label="Pending groups"
          value={groups.length}
          className="bg-indigo-50"
        />
        <SummaryCard
          icon={<Sparkles className="h-5 w-5 text-green-600" />}
          label="Likely merges"
          value={mergeLikelyCount}
          className="bg-green-50"
        />
        <SummaryCard
          icon={<CirclePause className="h-5 w-5 text-amber-600" />}
          label="Manual reviews"
          value={manualReviewCount}
          className="bg-amber-50"
        />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 md:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search stakeholder or company"
            className="pl-9"
          />
        </div>
        <select
          aria-label="Filter by company"
          value={company}
          onChange={(event) => setCompany(event.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All companies</option>
          {companies.map((companyName) => (
            <option key={companyName} value={companyName}>
              {companyName}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by recommendation"
          value={suggestion}
          onChange={(event) =>
            setSuggestion(event.target.value as 'all' | SuggestedResolution)
          }
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All recommendations</option>
          <option value="merge_likely">Likely merge</option>
          <option value="manual_review">Manual review</option>
        </select>
      </div>

      {filteredGroups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-green-500" />
          <h2 className="mt-3 font-semibold text-gray-900">
            {groups.length === 0 ? 'No pending duplicate groups' : 'No groups match the filters'}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {groups.length === 0
              ? 'The stakeholder review queue is clear.'
              : 'Try a different stakeholder, company, or recommendation.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredGroups.map((group) => (
            <DuplicateGroupCard
              key={group.groupId}
              group={group}
              expanded={expandedGroups.has(group.groupId)}
              resolutionEnabled={resolutionEnabled}
              onToggle={() => toggleGroup(group.groupId)}
              onResolved={() => handleResolved(group.groupId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DuplicateGroupCard({
  group,
  expanded,
  resolutionEnabled,
  onToggle,
  onResolved,
}: {
  group: StakeholderDuplicateGroup
  expanded: boolean
  resolutionEnabled: boolean
  onToggle: () => void
  onResolved: () => void
}) {
  const { toast } = useToast()
  const recommendedPrimary =
    group.items.find((item) => item.recommended_primary)?.source_id ??
    group.items[0]?.source_id
  const [primarySourceId, setPrimarySourceId] = useState(recommendedPrimary)
  const [resolution, setResolution] = useState<DuplicateResolution>(
    group.suggestedResolution === 'merge_likely' ? 'merge' : 'keep_separate'
  )
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submitResolution() {
    if (!resolutionEnabled) {
      toast('Live decisions are locked during validation.', 'info')
      return
    }
    if (
      !window.confirm(
        `Confirm “${RESOLUTION_LABELS[resolution]}” for ${group.fullName} at ${group.companyName}?`
      )
    ) {
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/stakeholder-duplicates/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: group.groupId,
          resolution,
          primarySourceId: resolution === 'merge' ? primarySourceId : null,
          notes,
        }),
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Resolution failed')
      onResolved()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Resolution failed', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-gray-50 sm:px-5"
        aria-expanded={expanded}
      >
        <span className="mt-1 text-gray-400">
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-gray-900">{group.fullName}</h2>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {group.companyName}
            </span>
            <SuggestionBadge suggestion={group.suggestedResolution} />
          </div>
          <p className="mt-1 text-xs text-gray-500">{group.suggestionReason}</p>
        </div>
        <span className="shrink-0 text-xs font-medium text-gray-400">
          {group.items.length} records
        </span>
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left">
                  <th className="sticky left-0 z-10 w-44 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Field
                  </th>
                  {group.items.map((item, index) => (
                    <th key={item.source_id} className="min-w-64 px-4 py-3 align-top">
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="radio"
                          name={`primary-${group.groupId}`}
                          checked={primarySourceId === item.source_id}
                          onChange={() => setPrimarySourceId(item.source_id)}
                          className="mt-0.5 h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-gray-900">
                            Record {index + 1}
                          </span>
                          <span className="mt-0.5 block font-mono text-[10px] font-normal text-gray-400">
                            {item.source_id.slice(0, 8)}
                          </span>
                        </span>
                      </label>
                      {item.recommended_primary && (
                        <span className="mt-2 inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                          Recommended primary
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {COMPARISON_FIELDS.map((field) => {
                  const differs = hasDifferentValues(group.items, field)
                  return (
                    <tr key={field.key} className={differs ? 'bg-amber-50/60' : undefined}>
                      <th
                        scope="row"
                        className={cn(
                          'sticky left-0 z-10 px-4 py-2.5 text-left text-xs font-medium text-gray-500',
                          differs ? 'bg-amber-50' : 'bg-white'
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          {field.label}
                          {differs && (
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-amber-500"
                              title="Values differ"
                            />
                          )}
                        </span>
                      </th>
                      {group.items.map((item) => (
                        <td
                          key={item.source_id}
                          className={cn(
                            'max-w-sm whitespace-pre-wrap break-words px-4 py-2.5 text-gray-700',
                            field.key === 'source_status' &&
                              item.source_status === 'archived' &&
                              'text-gray-400'
                          )}
                        >
                          {fieldValue(item, field)}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 border-t border-gray-200 bg-gray-50/70 p-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
            <fieldset>
              <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Prepared decision
              </legend>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(RESOLUTION_LABELS) as DuplicateResolution[]).map(
                  (option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setResolution(option)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                        resolution === option
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                      )}
                      aria-pressed={resolution === option}
                    >
                      {RESOLUTION_LABELS[option]}
                    </button>
                  )
                )}
              </div>
            </fieldset>
            <div>
              <label
                htmlFor={`notes-${group.groupId}`}
                className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                Resolution notes
              </label>
              <Textarea
                id={`notes-${group.groupId}`}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="Optional rationale or follow-up"
              />
            </div>
            <Button
              onClick={submitResolution}
              disabled={!resolutionEnabled || submitting}
              title={
                resolutionEnabled
                  ? 'Apply this decision'
                  : 'Resolution is locked during validation'
              }
            >
              {resolutionEnabled ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <LockKeyhole className="h-4 w-4" />
              )}
              {submitting
                ? 'Applying…'
                : resolutionEnabled
                  ? 'Confirm decision'
                  : 'Validation only'}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

function SuggestionBadge({ suggestion }: { suggestion: SuggestedResolution }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        suggestion === 'merge_likely'
          ? 'bg-green-100 text-green-700'
          : 'bg-amber-100 text-amber-800'
      )}
    >
      {suggestion === 'merge_likely' ? (
        <Sparkles className="h-3 w-3" />
      ) : (
        <CirclePause className="h-3 w-3" />
      )}
      {suggestionLabel(suggestion)}
    </span>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  className,
}: {
  icon: React.ReactNode
  label: string
  value: number
  className: string
}) {
  return (
    <div className={cn('flex items-center gap-3 rounded-xl p-4', className)}>
      <div className="rounded-lg bg-white p-2 shadow-sm">{icon}</div>
      <div>
        <div className="text-xl font-bold text-gray-900">{value}</div>
        <div className="text-xs font-medium text-gray-500">{label}</div>
      </div>
    </div>
  )
}
