'use client'

import { useEffect, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { getMaterials } from '@/lib/api/materials'
import { getErrorMessage } from '@/lib/api/client'
import type { MaterialSearchParams } from '@/types'
import { MaterialRow } from './material-row'
import { MaterialRowListSkeleton } from './material-skeletons'
import { ContentTransition } from '@/components/shared/page-transition'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState, type EmptyStateVariant } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'

const PAGE_SIZE = 20

interface MaterialInfiniteListProps {
  params?: Omit<MaterialSearchParams, 'page' | 'pageSize' | 'cursor'>
  emptyVariant?: EmptyStateVariant
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: React.ReactNode
}

export function MaterialInfiniteList({
  params = {},
  emptyVariant,
  emptyTitle = '暂无资料',
  emptyDescription,
  emptyAction,
}: MaterialInfiniteListProps) {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['materials', params],
    queryFn: ({ pageParam }) => getMaterials({ ...params, cursor: pageParam, pageSize: PAGE_SIZE }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => {
      if (typeof lastPage.hasMore === 'boolean') {
        return lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined
      }
      const loaded = lastPage.page * lastPage.pageSize
      return lastPage.total && loaded < lastPage.total ? String(lastPage.page + 1) : undefined
    },
  })

  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const items = data?.pages.flatMap((page) => page.items) ?? []

  return (
    <ContentTransition isLoading={isLoading} skeleton={<MaterialRowListSkeleton />}>
      {isError ? (
        <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} className="py-20" />
      ) : items.length === 0 ? (
        <EmptyState
          variant={emptyVariant}
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
          className="py-16"
        />
      ) : (
        <div className="space-y-2">
          {items.map((material) => (
            <MaterialRow key={material.id} material={material} />
          ))}
          <div ref={sentinelRef} className="h-px" />
          {isFetchingNextPage && <LoadingSpinner className="py-4" text="加载更多…" />}
          {!hasNextPage && (
            <p className="py-4 text-center text-xs text-muted-foreground">没有更多了</p>
          )}
        </div>
      )}
    </ContentTransition>
  )
}
