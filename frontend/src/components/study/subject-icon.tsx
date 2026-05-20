import { cn } from '@/lib/utils'

// Subject → display glyph + tint. Falls back to the first character of the
// subject name for anything not in the onboarding SUBJECTS list.
const SUBJECT_META: Record<string, { glyph: string; className: string }> = {
  语文: { glyph: '文', className: 'bg-rose-50 text-rose-700' },
  数学: { glyph: '数', className: 'bg-blue-50 text-blue-700' },
  英语: { glyph: 'En', className: 'bg-indigo-50 text-indigo-700' },
  物理: { glyph: '物', className: 'bg-cyan-50 text-cyan-700' },
  化学: { glyph: '化', className: 'bg-emerald-50 text-emerald-700' },
  生物: { glyph: '生', className: 'bg-green-50 text-green-700' },
  历史: { glyph: '史', className: 'bg-amber-50 text-amber-700' },
  地理: { glyph: '地', className: 'bg-orange-50 text-orange-700' },
  政治: { glyph: '政', className: 'bg-violet-50 text-violet-700' },
}

interface SubjectIconProps {
  subject?: string | null
  className?: string
}

export function SubjectIcon({ subject, className }: SubjectIconProps) {
  const meta = subject ? SUBJECT_META[subject] : undefined
  const glyph = meta?.glyph ?? subject?.slice(0, 1) ?? '?'
  return (
    <span
      className={cn(
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold',
        meta?.className ?? 'bg-muted text-muted-foreground',
        className,
      )}
      aria-hidden
    >
      {glyph}
    </span>
  )
}
