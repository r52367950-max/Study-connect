'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Star, Download } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { MaterialRowItem } from '@/types'
import { addFavorite, removeFavorite } from '@/lib/api/favorites'
import { getErrorMessage } from '@/lib/api/client'
import { useAuth } from '@/hooks/use-auth'
import { useFavorites } from '@/hooks/use-favorites'
import { SubjectIcon } from '@/components/study/subject-icon'
import { KindTag } from '@/components/materials/kind-tag'
import { toast } from '@/components/ui/use-toast'
import { cn, formatScore } from '@/lib/utils'

interface MaterialRowProps {
  material: MaterialRowItem
}

export function MaterialRow({ material }: MaterialRowProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { isLoggedIn } = useAuth()
  const { favoriteIds } = useFavorites()
  const isFav = favoriteIds.has(material.id)

  const mutation = useMutation({
    mutationFn: () => (isFav ? removeFavorite(material.id) : addFavorite(material.id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
      queryClient.invalidateQueries({ queryKey: ['materials'] })
      queryClient.invalidateQueries({ queryKey: ['recommendations'] })
    },
    onError: (err) =>
      toast({ variant: 'destructive', title: '操作失败', description: getErrorMessage(err) }),
  })

  const handleStar = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isLoggedIn) {
      router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`)
      return
    }
    mutation.mutate()
  }

  return (
    <div className="group flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-colors hover:border-foreground/20 hover:bg-accent/40">
      <SubjectIcon subject={material.subject} />
      <Link href={`/materials/${material.id}`} className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-medium group-hover:underline group-hover:underline-offset-2">
            {material.title}
          </h3>
          <KindTag kind={material.kind} />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {material.subject && <span>{material.subject}</span>}
          {material.grade && <span>{material.grade}</span>}
          {material.year && <span>{material.year}年</span>}
          <span className="flex items-center gap-0.5">
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
            {formatScore(material.avg_score)}
          </span>
          <span className="flex items-center gap-0.5">
            <Download className="h-3 w-3" />
            {material.download_count ?? 0}
          </span>
        </div>
      </Link>
      <button
        type="button"
        onClick={handleStar}
        disabled={mutation.isPending}
        aria-label={isFav ? '取消收藏' : '收藏'}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-accent disabled:opacity-50"
      >
        <Star
          className={cn(
            'h-4 w-4 transition-colors',
            isFav ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground',
          )}
        />
      </button>
    </div>
  )
}
