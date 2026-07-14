import { Action } from '@/types/proposal'
import { formatDate } from '@/lib/utils'

const CSV_COLUMNS: { key: keyof Action; label: string }[] = [
  { key: 'account_name', label: 'Account' },
  { key: 'title',        label: 'Action' },
  { key: 'contact_name', label: 'Contact' },
  { key: 'owner',        label: 'Owner' },
  { key: 'status',       label: 'Status' },
  { key: 'expected_by',  label: 'Expected By' },
  { key: 'days_live',    label: 'Days Quiet' },
  { key: 'summary',      label: 'Summary' },
]

function csvEscape(value: unknown): string {
  const str = value == null ? '' : String(value)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

export function actionsToCsv(actions: Action[]): string {
  const header = CSV_COLUMNS.map(c => csvEscape(c.label)).join(',')
  const rows = actions.map(a =>
    CSV_COLUMNS.map(({ key }) => {
      const value = key === 'expected_by' ? formatDate(a.expected_by) : a[key]
      return csvEscape(value)
    }).join(',')
  )
  return [header, ...rows].join('\n')
}

const UTF8_BOM = '﻿'

export function downloadCsv(actions: Action[], filename = 'open-actions.csv') {
  const csv = actionsToCsv(actions)
  const blob = new Blob([UTF8_BOM + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function actionsToText(actions: Action[]): string {
  const byAccount = new Map<string, Action[]>()
  for (const a of actions) {
    const key = a.account_name ?? 'Unassigned / General'
    if (!byAccount.has(key)) byAccount.set(key, [])
    byAccount.get(key)!.push(a)
  }

  const accounts = Array.from(byAccount.keys()).sort((a, b) => a.localeCompare(b))
  const lines: string[] = [`Open Actions — ${formatDate(new Date().toISOString())}`, '']

  for (const account of accounts) {
    lines.push(`*${account}*`)
    for (const a of byAccount.get(account)!) {
      const owner = a.owner === 'us' ? 'Us' : 'Client'
      const expected = a.expected_by ? ` (due ${formatDate(a.expected_by)})` : ''
      lines.push(`  • [${a.status}] ${a.title ?? '—'} — ${owner}${expected}`)
    }
    lines.push('')
  }

  return lines.join('\n').trim()
}

export async function copyActionsAsText(actions: Action[]): Promise<void> {
  await navigator.clipboard.writeText(actionsToText(actions))
}
