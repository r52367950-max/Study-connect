import { Skeleton } from '@/components/shared/skeleton'

/** Row skeleton mirroring <MaterialRow>'s icon + title/meta + star layout. */
export function MaterialRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
      <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
      <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
    </div>
  )
}

export function MaterialRowListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <MaterialRowSkeleton key={i} />
      ))}
    </div>
  )
}

/** Card skeleton mirroring <MaterialCard>'s tags + title + meta layout. */
export function MaterialCardSkeleton() {
  return (
    <div className="h-full rounded-xl border bg-card p-5">
      <div className="mb-3 flex gap-1.5">
        <Skeleton className="h-4 w-12 rounded-full" />
        <Skeleton className="h-4 w-10 rounded-full" />
      </div>
      <Skeleton className="mb-2 h-4 w-4/5" />
      <Skeleton className="mb-3 h-3 w-full" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  )
}

export function MaterialCardGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <MaterialCardSkeleton key={i} />
      ))}
    </div>
  )
}
