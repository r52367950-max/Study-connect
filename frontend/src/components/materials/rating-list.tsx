'use client'

import { useQuery } from '@tanstack/react-query'
import { Star } from 'lucide-react'
import { getRatings } from '@/lib/api/materials'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { formatRelativeTime } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

interface RatingListProps {
  materialId: string
}

function StarDisplay({ score }: { score: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${score} 星`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={cn(
            'h-3.5 w-3.5',
            score >= s ? 'fill-yellow-400 text-yellow-400' : 'fill-none text-muted-foreground/30',
          )}
        />
      ))}
    </div>
  )
}

export function RatingList({ materialId }: RatingListProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['ratings', materialId],
    queryFn: () => getRatings(materialId, { page: 1, pageSize: 20 }),
  })

  if (isLoading) {
    return <LoadingSpinner className="py-8" text="加载评论…" />
  }

  if (!data?.items.length) {
    return (
      <EmptyState
        title="暂无评价"
        description="成为第一个评价此资料的人"
        className="border-0 py-8"
      />
    )
  }

  return (
    <div className="space-y-4">
      {data.items.map((rating) => (
        <div key={rating.id} className="flex gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="text-[11px] bg-muted">
              {rating.user?.username?.slice(0, 2).toUpperCase() ?? 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">
                {rating.user?.username ?? '匿名用户'}
              </span>
              <StarDisplay score={rating.score} />
              <span className="text-xs text-muted-foreground ml-auto">
                {formatRelativeTime(rating.created_at)}
              </span>
            </div>
            {rating.content && (
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                {rating.content}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
