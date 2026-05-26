'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { useFavorites } from '@/hooks/use-favorites'
import { getErrorMessage } from '@/lib/api/client'
import { MaterialRow } from '@/components/materials/material-row'
import { MaterialRowListSkeleton } from '@/components/materials/material-skeletons'
import { ContentTransition } from '@/components/shared/page-transition'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { ErrorState } from '@/components/shared/error-state'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'

export default function PageFav() {
  const router = useRouter()
  const { isLoggedIn, initialized } = useAuth()
  const { data, isLoading, isError, error, refetch } = useFavorites()

  useEffect(() => {
    if (initialized && !isLoggedIn) {
      router.replace('/login?redirect=%2Ffavorites')
    }
  }, [initialized, isLoggedIn, router])

  if (!initialized || !isLoggedIn) {
    return <LoadingSpinner size="lg" className="py-20" text="正在加载…" />
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-bold tracking-tight">我的收藏</h1>

      <ContentTransition isLoading={isLoading} skeleton={<MaterialRowListSkeleton />}>
        {isError ? (
          <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} className="py-20" />
        ) : !data || data.length === 0 ? (
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
          <div className="space-y-2">
            {data.map((material) => (
              <MaterialRow key={material.id} material={material} />
            ))}
          </div>
        )}
      </ContentTransition>
    </div>
  )
}
