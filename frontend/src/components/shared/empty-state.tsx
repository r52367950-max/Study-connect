import { FileSearch } from 'lucide-react'
import { cn } from '@/lib/utils'

export type EmptyStateVariant = 'search' | 'favorites' | 'bookshelf'

interface EmptyStateProps {
  /** Selects a built-in black/gray line-art illustration. Omit to fall back to `icon`. */
  variant?: EmptyStateVariant
  /** Legacy: a small icon shown inside a muted circle (used when no `variant` is set). */
  icon?: React.ReactNode
  title?: string
  description?: string
  /** One or more CTA buttons (wrapped in a centered, wrapping row). */
  action?: React.ReactNode
  /** `sm` is tuned for tight surfaces like the ⌘K palette. */
  size?: 'sm' | 'md'
  className?: string
}

/** Shared SVG canvas for the line-art illustrations. */
function Illo({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-full w-full"
    >
      {children}
    </svg>
  )
}

function renderIllustration(variant: EmptyStateVariant) {
  switch (variant) {
    case 'search':
      return (
        <Illo>
          <circle cx="40" cy="40" r="22" />
          <line x1="56" y1="56" x2="76" y2="76" />
        </Illo>
      )
    case 'favorites':
      return (
        <Illo>
          <rect x="20" y="32" width="56" height="44" rx="5" />
          <line x1="20" y1="46" x2="76" y2="46" />
          <path d="M48 51 L50.2 56.9 L56.6 57.2 L51.6 61.2 L53.3 67.3 L48 63.8 L42.7 67.3 L44.4 61.2 L39.4 57.2 L45.8 56.9 Z" />
        </Illo>
      )
    case 'bookshelf':
      return (
        <Illo>
          <rect x="18" y="22" width="60" height="52" rx="4" />
          <line x1="18" y1="40" x2="78" y2="40" />
          <line x1="18" y1="58" x2="78" y2="58" />
          <rect x="25" y="28" width="6" height="12" rx="1" />
          <rect x="34" y="26" width="6" height="14" rx="1" />
        </Illo>
      )
  }
}

export function EmptyState({
  variant,
  icon,
  title = '暂无内容',
  description,
  action,
  size = 'md',
  className,
}: EmptyStateProps) {
  const sm = size === 'sm'
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        sm ? 'gap-2 py-8' : 'gap-3 rounded-xl border border-dashed py-16',
        className,
      )}
    >
      {variant ? (
        <div className={cn('text-muted-foreground/60', sm ? 'h-12 w-12' : 'h-20 w-20')}>
          {renderIllustration(variant)}
        </div>
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon ?? <FileSearch className="h-6 w-6" />}
        </div>
      )}
      <div className="space-y-1">
        <p className={cn('font-medium', sm ? 'text-xs' : 'text-sm')}>{title}</p>
        {description && (
          <p className="max-w-[280px] text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {action && (
        <div className={cn('flex flex-wrap items-center justify-center gap-2', sm ? 'mt-0.5' : 'mt-1')}>
          {action}
        </div>
      )}
    </div>
  )
}
