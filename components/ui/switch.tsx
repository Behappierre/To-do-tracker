'use client'

import { cn } from '@/lib/utils'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  title?: string
  className?: string
}

export function Switch({ checked, onChange, label, title, className }: SwitchProps) {
  return (
    <label className={cn('flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none', className)} title={title}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-indigo-600' : 'bg-gray-300'
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </button>
      {label}
    </label>
  )
}
