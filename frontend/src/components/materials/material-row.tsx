'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Star, Download } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { MaterialRowItem } from '@/types'
import { addFavorite, removeFavorite, type FavoriteIds } from '@/lib/api/favorites'
import { reportViewEvent } from '@/lib/api/view-events'
import { getErrorMessage } from '@/lib/api/client'
import { useAuth } from '@/hooks/use-auth'
import { useFavorites } from '@/hooks/use-favorites'
import { SubjectIcon } from '@/components/study/subject-icon'
import { KindTag } from '@/components/materials/kind-tag'
import { LoginPromptDialog } from '@/components/shared/login-prompt-dialog'
import { toast } from '@/components/ui/use-toast'
import { cn, formatScore } from '@/lib/utils'

interface MaterialRowProps {
  material: MaterialRowItem
}

// One impression per material per session, shared across every <MaterialRow>
// instance (recommendations + list + favorites) so the same card seen twice
// isn't double-counted. Cleared on logout / user switch (see providers.tsx) so
// account B doesn't inherit A's "already-reported" dedup set.
const reportedViewIds = new Set<string>()
const IMPRESSION_DWELL_MS = 500

export function resetReportedViewIds(): void {
  reportedViewIds.clear()
}

export function MaterialRow({ material }: MaterialRowProps) {
  const queryClient = useQueryClient()
  const { isLoggedIn } = useAuth()
  const [loginPromptOpen, setLoginPromptOpen] = useState(false)
  const { favoriteIds, isSuccess: favoritesLoaded } = useFavorites()
  const isFav = favoriteIds.has(material.id)
  const rowRef = useRef<HTMLDivElement | null>(null)

  // Impression tracking: when the row stays ~500ms visible, log one view event.
  useEffect(() => {
    if (!isLoggedIn) return
    const el = rowRef.current
    if (!el) return
    if (reportedViewIds.has(material.id)) return

    let timer: ReturnType<typeof setTimeout> | null = null
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry?.isIntersecting) {
          if (timer == null && !reportedViewIds.has(material.id)) {
            timer = setTimeout(() => {
              reportedViewIds.add(material.id)
              observer.disconnect()
              void reportViewEvent({ materialId: material.id, kind: material.kind })
            }, IMPRESSION_DWELL_MS)
          }
        } else if (timer != null) {
          clearTimeout(timer)
          timer = null
        }
      },
      { threshold: 0.5 },
    )
    observer.observe(el)
    return () => {
      if (timer != null) clearTimeout(timer)
      observer.disconnect()
    }
  }, [isLoggedIn, material.id, material.kind])

  const mutation = useMutation({
    mutationFn: () => (isFav ? removeFavorite(material.id) : addFavorite(material.id)),
    // Optimistic update: flip the star immediately without waiting for the RTT.
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['favorites'] })
      const prev = queryClient.getQueryData<FavoriteIds>(['favorites', 'ids'])
      queryClient.setQueryData<FavoriteIds | undefined>(['favorites', 'ids'], (old) => {
        if (!old) return old
        if (isFav) {
          return {
            items: old.items.filter((id) => id !== material.id),
            total: Math.max(old.total - 1, 0),
          }
        }
        return { items: [material.id, ...old.items], total: old.total + 1 }
      })
      return { prev }
    },
    onError: (err, _vars, ctx) => {
      // Roll back to the snapshot on error
      if (ctx?.prev !== undefined) {
        queryClient.setQueryData(['favorites', 'ids'], ctx.prev)
      }
      toast({ variant: 'destructive', title: '操作失败', description: getErrorMessage(err) })
    },
    onSettled: () => {
      // Always re-sync from server to reconcile with other tabs / race conditions
      void queryClient.invalidateQueries({ queryKey: ['favorites'] })
      void queryClient.invalidateQueries({ queryKey: ['materials'] })
      void queryClient.invalidateQueries({ queryKey: ['recommendations'] })
      // Also invalidate the detail-page cache so the star stays consistent there
      void queryClient.invalidateQueries({ queryKey: ['material', material.id] })
    },
  })

  const handleStar = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isLoggedIn) {
      setLoginPromptOpen(true)
      return
    }
    mutation.mutate()
  }

  return (
    <div
      ref={rowRef}
      className="group flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-colors hover:border-foreground/20 hover:bg-accent/40"
    >
      <SubjectIcon subject={material.subject} />
      <Link href={`/materials/${material.id}`} className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-medium group-hover:underline group-hover:underline-offset-2">
            {material.title}
          </h3>
          <KindTag kind={material.kind} />
        </div>
        <div className="mt-0.5 flex items-center gap-x-2 gap-y-0.5 overflow-hidden text-xs text-muted-foreground md:flex-wrap md:gap-x-3">
          {material.reason && (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground/90">
              {material.reason}
            </span>
          )}
          {material.subject && <span className="shrink-0">{material.subject}</span>}
          {material.grade && <span className="shrink-0">{material.grade}</span>}
          {material.year && <span className="shrink-0">{material.year}年</span>}
          <span className="flex shrink-0 items-center gap-0.5">
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
            {formatScore(material.avg_score)}
          </span>
          <span className="flex shrink-0 items-center gap-0.5">
            <Download className="h-3 w-3" />
            {material.download_count ?? 0}
          </span>
        </div>
      </Link>
      <button
        type="button"
        onClick={handleStar}
        // While logged in, wait for the favorites query before allowing a toggle:
        // before it resolves isFav is always false, so a click on an already-
        // favorited item would mistakenly call addFavorite and get a 409.
        disabled={mutation.isPending || (isLoggedIn && !favoritesLoaded)}
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
      <LoginPromptDialog
        open={loginPromptOpen}
        onOpenChange={setLoginPromptOpen}
        message="登录后即可收藏资料"
      />
    </div>
  )
}
