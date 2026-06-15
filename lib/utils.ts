import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO, differenceInDays } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    return format(parseISO(dateStr), 'dd MMM yyyy')
  } catch {
    return dateStr
  }
}

// Days live is based on updated_at — reflects how long since the action was last touched.
export function computeDaysLive(updatedAt: string | null | undefined): number {
  if (!updatedAt) return 0
  try {
    return differenceInDays(new Date(), parseISO(updatedAt))
  } catch {
    return 0
  }
}

export function daysLiveColor(days: number): string {
  if (days < 14) return 'text-green-600'
  if (days <= 30) return 'text-amber-500'
  return 'text-red-600'
}

export function daysLiveBg(days: number): string {
  if (days < 14) return 'bg-green-50 text-green-700'
  if (days <= 30) return 'bg-amber-50 text-amber-700'
  return 'bg-red-50 text-red-700'
}
