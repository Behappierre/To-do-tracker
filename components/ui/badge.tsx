import { cn } from '@/lib/utils'
import { ProposalStatus } from '@/types/proposal'

const statusConfig: Record<ProposalStatus, string> = {
  Open: 'bg-blue-100 text-blue-800',
  'Followed Up': 'bg-yellow-100 text-yellow-800',
  Responded: 'bg-green-100 text-green-800',
  Closed: 'bg-gray-100 text-gray-700',
  Stalled: 'bg-red-100 text-red-800',
}

export function StatusBadge({ status }: { status: ProposalStatus | string }) {
  const classes = statusConfig[status as ProposalStatus] ?? 'bg-gray-100 text-gray-700'
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', classes)}>
      {status}
    </span>
  )
}
