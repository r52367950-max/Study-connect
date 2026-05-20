'use client'

import { useEffect, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { getMaterials } from '@/lib/api/materials'
import { getErrorMessage } from '@/lib/api/client'
import type { MaterialSearchParams } from '@/types'
import { MaterialRow } from './material-row'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'

const PAGE_SIZE = 20

interface MaterialInfiniteListProps {
  params?: Omit<MaterialSearchParams, 'page' | 'pageSize'>
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: React.ReactNode
}

export function MaterialInfiniteList({
  params = {},
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
    queryFn: ({ pageParam }) => getMaterials({ ...params, page: pageParam, pageSize: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const loaded = lastPage.page * lastPage.pageSize
      return loaded < lastPage.total ? lastPage.page + 1 : undefined
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

  if (isLoading) {
    return <LoadingSpinner size="lg" className="py-20" text="正在加载资料…" />
  }
  if (isError) {
    return <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} className="py-20" />
  }

  const items = data?.pages.flatMap((page) => page.items) ?? []
  if (items.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
        className="py-16"
      />
    )
  }

  return (
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
  )
}
