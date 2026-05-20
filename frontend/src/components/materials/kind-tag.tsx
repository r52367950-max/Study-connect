import type { MaterialKind } from '@/types'
import { cn } from '@/lib/utils'

const KIND_META: Record<MaterialKind, { label: string; className: string }> = {
  EXERCISE: { label: '练习', className: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
  HANDOUT: { label: '讲义', className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  EXAM: { label: '真题', className: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  MOCK: { label: '模拟', className: 'bg-violet-50 text-violet-700 ring-violet-600/20' },
}

interface KindTagProps {
  kind?: MaterialKind | null
  className?: string
}

export function KindTag({ kind, className }: KindTagProps) {
  if (!kind) return null
  const meta = KIND_META[kind]
  if (!meta) return null
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  )
}
