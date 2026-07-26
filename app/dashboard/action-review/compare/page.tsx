'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Check,
  GitCompareArrows,
  Loader2,
  Search,
} from 'lucide-react'
import { Action, EntityOptions, LinkReviewStatus } from '@/types/proposal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

type ComparisonFilter = 'all' | 'needs_review' | 'blank_stakeholder' | 'completed'
type DecisionValue = 'pending' | 'no_match' | `linked:${string}`

interface DecisionDraft {
  company: DecisionValue
  stakeholder: DecisionValue
}

const PAGE_SIZE = 30

function normalize(value: string | null | undefined) {
  return (value ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function decisionValue(status: LinkReviewStatus, id: string | null): DecisionValue {
  if (status === 'linked' && id) return `linked:${id}`
  return status === 'no_match' ? 'no_match' : 'pending'
}

function linkedId(value: DecisionValue) {
  return value.startsWith('linked:') ? value.slice('linked:'.length) : null
}

function initialDraft(action: Action): DecisionDraft {
  return {
    company: decisionValue(action.company_link_status, action.company_id),
    stakeholder: decisionValue(
      action.stakeholder_link_status,
      action.primary_stakeholder_id
    ),
  }
}

function isCompleted(action: Action) {
  return action.company_link_status !== 'pending' &&
    action.stakeholder_link_status !== 'pending'
}

export default function LinkDecisionComparisonPage() {
  const { toast } = useToast()
  const [actions, setActions] = useState<Action[]>([])
  const [entities, setEntities] = useState<EntityOptions>({ companies: [], stakeholders: [] })
  const [drafts, setDrafts] = useState<Record<string, DecisionDraft>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<ComparisonFilter>('needs_review')
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadComparison() {
      try {
        const [actionsResponse, entitiesResponse] = await Promise.all([
          fetch('/api/proposals'),
          fetch('/api/entity-options'),
        ])
        const [actionsJson, entitiesJson] = await Promise.all([
          actionsResponse.json(),
          entitiesResponse.json(),
        ])

        if (!actionsResponse.ok) throw new Error(actionsJson.error || 'Could not load actions')
        if (!entitiesResponse.ok) {
          throw new Error(entitiesJson.error || 'Could not load company and stakeholder records')
        }

        if (!cancelled) {
          setActions(Array.isArray(actionsJson) ? actionsJson : [])
          setEntities(entitiesJson)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load comparison')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadComparison()
    return () => { cancelled = true }
  }, [])

  const filteredActions = useMemo(() => {
    const query = normalize(search)

    return actions.filter((action) => {
      if (
        filter === 'needs_review' &&
        action.company_link_status !== 'pending' &&
        action.stakeholder_link_status !== 'pending'
      ) return false
      if (
        filter === 'blank_stakeholder' &&
        (action.primary_stakeholder_id || action.stakeholder_link_status !== 'pending')
      ) return false
      if (filter === 'completed' && !isCompleted(action)) return false
      if (!query) return true

      return normalize([
        action.title,
        action.account_name,
        action.contact_name,
        action.company_name,
        action.stakeholder_name,
      ].filter(Boolean).join(' ')).includes(query)
    })
  }, [actions, filter, search])

  const pendingCount = actions.filter((action) =>
    action.company_link_status === 'pending' ||
    action.stakeholder_link_status === 'pending'
  ).length
  const blankStakeholderCount = actions.filter((action) =>
    !action.primary_stakeholder_id &&
    action.stakeholder_link_status === 'pending'
  ).length
  const completedCount = actions.filter(isCompleted).length

  function updateDraft(action: Action, updates: Partial<DecisionDraft>) {
    setDrafts((current) => ({
      ...current,
      [action.id]: {
        ...(current[action.id] ?? initialDraft(action)),
        ...updates,
      },
    }))
  }

  async function saveDecisions(action: Action) {
    const draft = drafts[action.id] ?? initialDraft(action)
    const companyId = linkedId(draft.company)
    const stakeholderId = linkedId(draft.stakeholder)
    const stakeholder = stakeholderId
      ? entities.stakeholders.find((option) => option.id === stakeholderId)
      : null

    if (
      companyId &&
      stakeholder?.company_id &&
      stakeholder.company_id !== companyId
    ) {
      toast('The selected stakeholder belongs to a different company.', 'error')
      return
    }

    const body: Record<string, unknown> = {
      company_id: companyId,
      company_link_status: companyId ? 'linked' : draft.company,
      primary_stakeholder_id: stakeholderId,
      stakeholder_link_status: stakeholderId ? 'linked' : draft.stakeholder,
    }

    const company = companyId
      ? entities.companies.find((option) => option.id === companyId)
      : null
    if (company) body.account_name = company.name
    if (stakeholder) body.contact_name = stakeholder.full_name

    setSavingId(action.id)
    try {
      const response = await fetch(`/api/proposals/${action.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Could not save link decisions')

      setActions((current) => current.map((item) => item.id === action.id ? json : item))
      setDrafts((current) => {
        const next = { ...current }
        delete next[action.id]
        return next
      })
      toast('Link decisions saved', 'success')
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : 'Could not save link decisions', 'error')
    } finally {
      setSavingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading decision comparison...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link
            href="/dashboard/action-review"
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:text-indigo-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to guided review
          </Link>
          <div className="flex items-center gap-2">
            <GitCompareArrows className="h-6 w-6 text-indigo-600" />
            <h1 className="text-2xl font-bold text-gray-900">Link decision comparison</h1>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            Compare the source names with the reviewed company and stakeholder links.
            A stakeholder can stay blank for later without blocking the company decision.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Metric label="Actions needing review" value={pendingCount} />
        <Metric label="Stakeholder left blank" value={blankStakeholderCount} />
        <Metric label="Both decisions complete" value={completedCount} />
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap rounded-lg border border-gray-200 bg-white p-1">
          {([
            ['all', 'All actions'],
            ['needs_review', 'Needs review'],
            ['blank_stakeholder', 'Blank stakeholder'],
            ['completed', 'Completed'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => {
                setFilter(value)
                setVisibleCount(PAGE_SIZE)
              }}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                filter === value
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative w-full xl:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setVisibleCount(PAGE_SIZE)
            }}
            placeholder="Search actions or decisions"
            className="pl-9"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {!error && filteredActions.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          No actions match this filter.
        </div>
      )}

      {!error && filteredActions.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="hidden grid-cols-[minmax(220px,1.2fr)_minmax(210px,1fr)_minmax(260px,1.2fr)_auto] gap-4 border-b border-gray-200 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 lg:grid">
            <span>Action and source</span>
            <span>Company decision</span>
            <span>Stakeholder decision</span>
            <span className="sr-only">Save</span>
          </div>

          <div className="divide-y divide-gray-200">
            {filteredActions.slice(0, visibleCount).map((action) => {
              const original = initialDraft(action)
              const draft = drafts[action.id] ?? original
              const selectedCompanyId = linkedId(draft.company)
              const selectedStakeholderId = linkedId(draft.stakeholder)
              const selectedStakeholder = selectedStakeholderId
                ? entities.stakeholders.find((option) => option.id === selectedStakeholderId)
                : null
              const availableStakeholders = entities.stakeholders.filter((stakeholder) =>
                !selectedCompanyId ||
                stakeholder.company_id === selectedCompanyId ||
                stakeholder.id === selectedStakeholderId
              )
              const dirty = draft.company !== original.company ||
                draft.stakeholder !== original.stakeholder
              const saving = savingId === action.id

              return (
                <article
                  key={action.id}
                  className="grid grid-cols-1 gap-4 px-5 py-5 lg:grid-cols-[minmax(220px,1.2fr)_minmax(210px,1fr)_minmax(260px,1.2fr)_auto] lg:items-start"
                >
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold text-gray-900">
                      {action.title ?? 'Untitled action'}
                    </h2>
                    <div className="mt-2 space-y-1 text-sm text-gray-500">
                      <p>
                        <span className="font-medium text-gray-700">Source company:</span>{' '}
                        {action.account_name || 'Blank'}
                      </p>
                      <p>
                        <span className="font-medium text-gray-700">Source stakeholder:</span>{' '}
                        {action.contact_name || 'Blank'}
                      </p>
                    </div>
                  </div>

                  <DecisionField
                    label="Company decision"
                    status={draft.company === 'pending' ? 'Blank for now' : undefined}
                  >
                    <Select
                      aria-label={`Company decision for ${action.title ?? 'action'}`}
                      value={draft.company}
                      onChange={(event) => {
                        const companyDecision = event.target.value as DecisionValue
                        const companyId = linkedId(companyDecision)
                        const stakeholderCompanyId = selectedStakeholder?.company_id
                        updateDraft(action, {
                          company: companyDecision,
                          ...(companyId && stakeholderCompanyId && companyId !== stakeholderCompanyId
                            ? { stakeholder: 'pending' as const }
                            : {}),
                        })
                      }}
                    >
                      <option value="pending">— Leave blank for now —</option>
                      <option value="no_match">No matching company</option>
                      {entities.companies.map((company) => (
                        <option key={company.id} value={`linked:${company.id}`}>
                          {company.name}
                        </option>
                      ))}
                    </Select>
                  </DecisionField>

                  <DecisionField
                    label="Stakeholder decision"
                    status={draft.stakeholder === 'pending' ? 'Blank for now' : undefined}
                  >
                    <Select
                      aria-label={`Stakeholder decision for ${action.title ?? 'action'}`}
                      value={draft.stakeholder}
                      onChange={(event) => {
                        const stakeholderDecision = event.target.value as DecisionValue
                        const stakeholderId = linkedId(stakeholderDecision)
                        const stakeholder = stakeholderId
                          ? entities.stakeholders.find((option) => option.id === stakeholderId)
                          : null
                        updateDraft(action, {
                          stakeholder: stakeholderDecision,
                          ...(stakeholder?.company_id
                            ? { company: `linked:${stakeholder.company_id}` as const }
                            : {}),
                        })
                      }}
                    >
                      <option value="pending">— Leave blank for now —</option>
                      <option value="no_match">No matching stakeholder</option>
                      {availableStakeholders.map((stakeholder) => (
                        <option key={stakeholder.id} value={`linked:${stakeholder.id}`}>
                          {stakeholder.full_name}
                          {stakeholder.title ? ` — ${stakeholder.title}` : ''}
                        </option>
                      ))}
                    </Select>
                  </DecisionField>

                  <div className="flex justify-end lg:pt-6">
                    <Button
                      size="sm"
                      onClick={() => saveDecisions(action)}
                      disabled={!dirty || saving}
                    >
                      {saving
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Check className="h-3.5 w-3.5" />}
                      Save
                    </Button>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      )}

      {visibleCount < filteredActions.length && (
        <div className="text-center">
          <Button
            variant="secondary"
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          >
            Show {Math.min(PAGE_SIZE, filteredActions.length - visibleCount)} more
          </Button>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

function DecisionField({
  label,
  status,
  children,
}: {
  label: string
  status?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium uppercase tracking-wide text-gray-500 lg:hidden">
          {label}
        </label>
        {status && (
          <span className="text-xs font-medium text-amber-700">{status}</span>
        )}
      </div>
      {children}
    </div>
  )
}
