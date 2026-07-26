'use client'

import { useEffect, useMemo, useState } from 'react'
import { Building2, Check, GitCompareArrows, Link2, Loader2, Search, UserRound, X } from 'lucide-react'
import Link from 'next/link'
import { Action, EntityOptions } from '@/types/proposal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

type QueueFilter = 'all' | 'company' | 'stakeholder'

interface DraftLink {
  companyId: string
  stakeholderId: string
}

interface Suggestion<T> {
  option: T
  score: number
}

const PAGE_SIZE = 25

function normalize(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function similarity(source: string | null, candidate: string) {
  const left = normalize(source)
  const right = normalize(candidate)
  if (!left || !right) return 0
  if (left === right) return 1
  if (left.includes(right) || right.includes(left)) return 0.88

  const leftTokens = new Set(left.split(' '))
  const rightTokens = new Set(right.split(' '))
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length
  const union = new Set([...leftTokens, ...rightTokens]).size
  return union ? intersection / union : 0
}

function bestSuggestion<T>(
  source: string | null,
  options: T[],
  label: (option: T) => string,
  minimumScore = 0.34
): Suggestion<T> | null {
  let best: Suggestion<T> | null = null

  for (const option of options) {
    const score = similarity(source, label(option))
    if (score >= minimumScore && (!best || score > best.score)) {
      best = { option, score }
    }
  }

  return best
}

export default function ActionLinkReviewPage() {
  const { toast } = useToast()
  const [actions, setActions] = useState<Action[]>([])
  const [entities, setEntities] = useState<EntityOptions>({ companies: [], stakeholders: [] })
  const [drafts, setDrafts] = useState<Record<string, DraftLink>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<QueueFilter>('all')
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadQueue() {
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
        if (!entitiesResponse.ok) throw new Error(entitiesJson.error || 'Could not load StakeMap records')

        if (!cancelled) {
          setActions(Array.isArray(actionsJson) ? actionsJson : [])
          setEntities(entitiesJson)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load review queue')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadQueue()
    return () => { cancelled = true }
  }, [])

  const pendingActions = useMemo(
    () => actions.filter((action) =>
      action.company_link_status === 'pending' ||
      action.stakeholder_link_status === 'pending'
    ),
    [actions]
  )

  const companyPending = actions.filter((action) => action.company_link_status === 'pending').length
  const stakeholderPending = actions.filter((action) => action.stakeholder_link_status === 'pending').length

  const filteredActions = useMemo(() => {
    const query = normalize(search)
    return pendingActions.filter((action) => {
      if (filter === 'company' && action.company_link_status !== 'pending') return false
      if (filter === 'stakeholder' && action.stakeholder_link_status !== 'pending') return false
      if (!query) return true
      return normalize([
        action.title,
        action.account_name,
        action.contact_name,
      ].filter(Boolean).join(' ')).includes(query)
    })
  }, [pendingActions, filter, search])

  const updateDraft = (action: Action, updates: Partial<DraftLink>) => {
    setDrafts((current) => ({
      ...current,
      [action.id]: {
        companyId: current[action.id]?.companyId ?? action.company_id ?? '',
        stakeholderId:
          current[action.id]?.stakeholderId ?? action.primary_stakeholder_id ?? '',
        ...updates,
      },
    }))
  }

  const saveDecision = async (
    action: Action,
    decision: 'save' | 'no_company' | 'no_stakeholder'
  ) => {
    const draft = drafts[action.id] ?? {
      companyId: action.company_id ?? '',
      stakeholderId: action.primary_stakeholder_id ?? '',
    }
    const company = entities.companies.find((option) => option.id === draft.companyId)
    const stakeholder = entities.stakeholders.find((option) => option.id === draft.stakeholderId)
    const body: Record<string, unknown> = {}

    if (decision === 'no_company') {
      body.company_id = null
      body.primary_stakeholder_id = null
      body.company_link_status = 'no_match'
      body.stakeholder_link_status = 'no_match'
    } else if (decision === 'no_stakeholder') {
      body.primary_stakeholder_id = null
      body.stakeholder_link_status = 'no_match'
    } else {
      body.company_id = draft.companyId || null
      body.primary_stakeholder_id = draft.stakeholderId || null
      if (company) body.account_name = company.name
      if (stakeholder) body.contact_name = stakeholder.full_name
    }

    setSavingId(action.id)
    try {
      const response = await fetch(`/api/proposals/${action.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Could not save review decision')

      setActions((current) => current.map((item) => item.id === action.id ? json : item))
      setDrafts((current) => {
        const next = { ...current }
        delete next[action.id]
        return next
      })
      toast(decision === 'save' ? 'Canonical links saved' : 'No-match decision recorded', 'success')
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : 'Could not save review decision', 'error')
    } finally {
      setSavingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading action review queue…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link2 className="w-6 h-6 text-indigo-600" />
            <h1 className="text-2xl font-bold text-gray-900">Action link review</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1 max-w-3xl">
            Confirm canonical StakeMap links or explicitly record that no suitable match exists.
            Suggestions never save automatically.
          </p>
        </div>
        <Link
          href="/dashboard/action-review/compare"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
        >
          <GitCompareArrows className="h-4 w-4" />
          Compare decisions
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Metric label="Actions needing review" value={pendingActions.length} />
        <Metric label="Company decisions pending" value={companyPending} icon={<Building2 className="w-4 h-4" />} />
        <Metric label="Stakeholder decisions pending" value={stakeholderPending} icon={<UserRound className="w-4 h-4" />} />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex rounded-lg border border-gray-200 p-1 bg-white">
          {([
            ['all', 'All pending'],
            ['company', 'Company'],
            ['stakeholder', 'Stakeholder'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => { setFilter(value); setVisibleCount(PAGE_SIZE) }}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                filter === value ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search}
            onChange={(event) => { setSearch(event.target.value); setVisibleCount(PAGE_SIZE) }}
            placeholder="Search action, company or contact"
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
        <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
          <Check className="w-8 h-8 text-green-600 mx-auto mb-2" />
          <p className="font-medium text-green-900">No actions match this review filter.</p>
        </div>
      )}

      <div className="space-y-4">
        {filteredActions.slice(0, visibleCount).map((action) => {
          const draft = drafts[action.id] ?? {
            companyId: action.company_id ?? '',
            stakeholderId: action.primary_stakeholder_id ?? '',
          }
          const companySuggestion = action.company_link_status === 'pending'
            ? bestSuggestion(action.account_name, entities.companies, (option) => option.name)
            : null
          const effectiveCompanyId = draft.companyId
          const availableStakeholders = entities.stakeholders.filter(
            (stakeholder) => !effectiveCompanyId || stakeholder.company_id === effectiveCompanyId
          )
          const stakeholderSuggestion = action.stakeholder_link_status === 'pending'
            ? bestSuggestion(
                action.contact_name,
                availableStakeholders,
                (option) => option.full_name,
                0.4
              )
            : null
          const saving = savingId === action.id

          return (
            <article key={action.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900">{action.title ?? 'Untitled action'}</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Source: {action.account_name ?? 'No company'} · {action.contact_name ?? 'No contact'}
                  </p>
                </div>
                <div className="flex gap-2">
                  {action.company_link_status === 'pending' && <PendingBadge label="Company pending" />}
                  {action.stakeholder_link_status === 'pending' && <PendingBadge label="Stakeholder pending" />}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5">
                <ReviewField
                  label="Canonical company"
                  pending={action.company_link_status === 'pending'}
                  suggestion={companySuggestion
                    ? `${companySuggestion.option.name} · ${Math.round(companySuggestion.score * 100)}%`
                    : null}
                  onUseSuggestion={companySuggestion ? () => updateDraft(action, {
                    companyId: companySuggestion.option.id,
                    stakeholderId: '',
                  }) : undefined}
                >
                  <Select
                    aria-label={`Canonical company for ${action.title ?? 'action'}`}
                    value={draft.companyId}
                    onChange={(event) => updateDraft(action, {
                      companyId: event.target.value,
                      stakeholderId: '',
                    })}
                  >
                    <option value="">— Not linked —</option>
                    {entities.companies.map((company) => (
                      <option key={company.id} value={company.id}>{company.name}</option>
                    ))}
                  </Select>
                </ReviewField>

                <ReviewField
                  label="Primary stakeholder"
                  pending={action.stakeholder_link_status === 'pending'}
                  suggestion={stakeholderSuggestion
                    ? `${stakeholderSuggestion.option.full_name} · ${Math.round(stakeholderSuggestion.score * 100)}%`
                    : null}
                  onUseSuggestion={stakeholderSuggestion ? () => {
                    const suggestion = stakeholderSuggestion.option
                    updateDraft(action, {
                      companyId: suggestion.company_id ?? draft.companyId,
                      stakeholderId: suggestion.id,
                    })
                  } : undefined}
                >
                  <Select
                    aria-label={`Primary stakeholder for ${action.title ?? 'action'}`}
                    value={draft.stakeholderId}
                    onChange={(event) => {
                      const stakeholder = entities.stakeholders.find(
                        (option) => option.id === event.target.value
                      )
                      updateDraft(action, {
                        stakeholderId: event.target.value,
                        companyId: stakeholder?.company_id ?? draft.companyId,
                      })
                    }}
                  >
                    <option value="">— Not linked —</option>
                    {availableStakeholders.map((stakeholder) => (
                      <option key={stakeholder.id} value={stakeholder.id}>
                        {stakeholder.full_name}{stakeholder.title ? ` — ${stakeholder.title}` : ''}
                      </option>
                    ))}
                  </Select>
                </ReviewField>
              </div>

              <div className="flex flex-wrap justify-end gap-2 mt-5 pt-4 border-t">
                {action.stakeholder_link_status === 'pending' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => saveDecision(action, 'no_stakeholder')}
                    disabled={saving}
                  >
                    <X className="w-3.5 h-3.5" />
                    No stakeholder match
                  </Button>
                )}
                {action.company_link_status === 'pending' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => saveDecision(action, 'no_company')}
                    disabled={saving}
                  >
                    <X className="w-3.5 h-3.5" />
                    No company match
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => saveDecision(action, 'save')}
                  disabled={saving || (!draft.companyId && !draft.stakeholderId)}
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Save links
                </Button>
              </div>
            </article>
          )
        })}
      </div>

      {visibleCount < filteredActions.length && (
        <div className="text-center">
          <Button variant="secondary" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
            Show {Math.min(PAGE_SIZE, filteredActions.length - visibleCount)} more
          </Button>
        </div>
      )}
    </div>
  )
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string
  value: number
  icon?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        {icon}{label}
      </div>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  )
}

function PendingBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
      {label}
    </span>
  )
}

function ReviewField({
  label,
  pending,
  suggestion,
  onUseSuggestion,
  children,
}: {
  label: string
  pending: boolean
  suggestion: string | null
  onUseSuggestion?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</label>
        {!pending && <span className="text-xs font-medium text-green-700">Resolved</span>}
      </div>
      {children}
      {pending && suggestion && onUseSuggestion && (
        <button
          onClick={onUseSuggestion}
          className="text-left text-xs text-indigo-700 hover:text-indigo-900"
        >
          Suggested: {suggestion} — use this
        </button>
      )}
      {pending && !suggestion && (
        <p className="text-xs text-gray-400">No strong automatic suggestion.</p>
      )}
    </div>
  )
}
