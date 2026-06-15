import { cn } from '@/lib/utils'
import { ActionStatus } from '@/types/proposal'

const statusConfig: Record<ActionStatus, string> = {
  Open:        'bg-blue-100 text-blue-800',
  Nudged:      'bg-yellow-100 text-yellow-800',
  'In Progress': 'bg-indigo-100 text-indigo-800',
  Done:        'bg-green-100 text-green-800',
  Stalled:     'bg-red-100 text-red-800',
  Superseded:  'bg-gray-100 text-gray-500',
}

export function StatusBadge({ status }: { status: ActionStatus | string }) {
  const classes = statusConfig[status as ActionStatus] ?? 'bg-gray-100 text-gray-700'
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', classes)}>
      {status}
    </span>
  )
}
