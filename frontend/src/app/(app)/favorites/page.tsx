'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/use-auth'
import { getFavorites } from '@/lib/api/favorites'
import { getErrorMessage } from '@/lib/api/client'
import { MaterialRow } from '@/components/materials/material-row'
import { MaterialRowListSkeleton } from '@/components/materials/material-skeletons'
import { ContentTransition } from '@/components/shared/page-transition'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { ErrorState } from '@/components/shared/error-state'
import { EmptyState } from '@/components/shared/empty-state'
import { Pagination } from '@/components/shared/pagination'
import { Button } from '@/components/ui/button'

const PAGE_SIZE = 20

export default function PageFav() {
  const router = useRouter()
  const { isLoggedIn, initialized } = useAuth()
  const [page, setPage] = useState(1)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['favorites', 'list', page],
    queryFn: () => getFavorites({ page, pageSize: PAGE_SIZE }),
    enabled: initialized && isLoggedIn,
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  })

  useEffect(() => {
    if (initialized && !isLoggedIn) {
      router.replace('/login?redirect=%2Ffavorites')
    }
  }, [initialized, isLoggedIn, router])

  // When removals empty the current page (e.g. last item on page 3), step back
  // instead of stranding the user on an empty out-of-range page.
  useEffect(() => {
    if (data && data.items.length === 0 && page > 1 && data.total > 0) {
      setPage(Math.max(1, Math.ceil(data.total / PAGE_SIZE)))
    }
  }, [data, page])

  if (!initialized || !isLoggedIn) {
    return <LoadingSpinner size="lg" className="py-20" text="正在加载…" />
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-bold tracking-tight">我的收藏</h1>

      <ContentTransition isLoading={isLoading} skeleton={<MaterialRowListSkeleton />}>
        {isError ? (
          <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} className="py-20" />
        ) : !data || data.total === 0 ? (
          <EmptyState
            variant="favorites"
            title="还没有收藏"
            description="收藏喜欢的资料，方便随时回看"
            className="py-16"
            action={
              <Button size="sm" onClick={() => router.push('/')}>
                去浏览资料
              </Button>
            }
          />
        ) : (
          <>
            <div className="space-y-2">
              {data.items.map((material) => (
                <MaterialRow key={material.id} material={material} />
              ))}
            </div>
            <Pagination
              page={page}
              total={data.total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              className="pt-2"
            />
          </>
        )}
      </ContentTransition>
    </div>
  )
}
