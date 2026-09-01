'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, Copy, Loader2, X } from 'lucide-react'
import { Action } from '@/types/proposal'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { formatDate } from '@/lib/utils'

interface DuplicatePair {
  actionA: Action
  actionB: Action
  score: number
}

function pairKey(pair: DuplicatePair) {
  return `${pair.actionA.id}:${pair.actionB.id}`
}

function truncate(title: string | null, max = 40) {
  const t = title ?? 'Untitled'
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

export default function DuplicateReviewPage() {
  const { toast } = useToast()
  const [pairs, setPairs] = useState<DuplicatePair[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/action-duplicates')
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Could not load duplicate candidates')
        if (!cancelled) setPairs(Array.isArray(json) ? json : [])
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load duplicate candidates')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  const resolve = async (pair: DuplicatePair, resolution: 'supersede' | 'dismissed', keepOpenId?: string) => {
    setBusyKey(pairKey(pair))
    try {
      const res = await fetch('/api/action-duplicates/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionIdA: pair.actionA.id, actionIdB: pair.actionB.id, resolution, keepOpenId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not save decision')

      setPairs((prev) => prev.filter((p) => pairKey(p) !== pairKey(pair)))
      toast(resolution === 'dismissed' ? 'Marked as not a duplicate' : 'Marked as superseded', 'success')
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : 'Could not save decision', 'error')
    } finally {
      setBusyKey(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        Scanning for duplicate actions…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/action-review"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:text-indigo-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to link review
        </Link>
        <div className="flex items-center gap-2">
          <Copy className="h-6 w-6 text-indigo-600" />
          <h1 className="text-2xl font-bold text-gray-900">Duplicate action review</h1>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-gray-500">
          Candidate pairs of open actions on the same account with similar titles or summaries.
          Nothing merges automatically — mark one as superseding the other, or dismiss the pair
          if they&apos;re genuinely different asks. Dismissed pairs won&apos;t resurface.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}

      {!error && pairs.length === 0 && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
          <Check className="w-8 h-8 text-green-600 mx-auto mb-2" />
          <p className="font-medium text-green-900">No duplicate candidates found.</p>
        </div>
      )}

      <div className="space-y-4">
        {pairs.map((pair) => {
          const busy = busyKey === pairKey(pair)
          return (
            <article key={pairKey(pair)} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-4">
                <span className="text-xs font-medium text-gray-400">
                  {pair.actionA.account_name ?? 'No account'}
                </span>
                <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  {Math.round(pair.score * 100)}% similar
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ActionCard action={pair.actionA} />
                <ActionCard action={pair.actionB} />
              </div>

              <div className="flex flex-wrap justify-end gap-2 mt-4 pt-4 border-t">
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => resolve(pair, 'dismissed')}>
                  <X className="w-3.5 h-3.5" /> Not a duplicate
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => resolve(pair, 'supersede', pair.actionA.id)}
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  &quot;{truncate(pair.actionA.title)}&quot; supersedes the other
                </Button>
                <Button size="sm" disabled={busy} onClick={() => resolve(pair, 'supersede', pair.actionB.id)}>
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  &quot;{truncate(pair.actionB.title)}&quot; supersedes the other
                </Button>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function ActionCard({ action }: { action: Action }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-gray-900 text-sm">{action.title ?? 'Untitled action'}</h3>
        <StatusBadge status={action.status} />
      </div>
      <p className="text-xs text-gray-500 mt-1">
        {formatDate(action.source_date)} · {action.contact_name ?? 'No contact'}
      </p>
      {action.summary && (
        <p className="text-xs text-gray-600 mt-2 line-clamp-3">{action.summary}</p>
      )}
    </div>
  )
}
