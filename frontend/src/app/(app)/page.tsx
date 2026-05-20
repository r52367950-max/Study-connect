'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { getRecommendedMaterials } from '@/lib/api/recommendations'
import { getErrorMessage } from '@/lib/api/client'
import { useAuth } from '@/hooks/use-auth'
import { MaterialRow } from '@/components/materials/material-row'
import { MaterialInfiniteList } from '@/components/materials/material-infinite-list'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { ErrorState } from '@/components/shared/error-state'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'

export default function PageHome() {
  const { isLoggedIn } = useAuth()
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['recommendations'],
    queryFn: () => getRecommendedMaterials(),
    enabled: isLoggedIn,
  })

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {isLoggedIn && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold tracking-tight">推荐资料</h1>
            <Button
              variant="outline"
              size="sm"
              disabled={isFetching}
              onClick={() => queryClient.invalidateQueries({ queryKey: ['recommendations'] })}
            >
              <RefreshCw className="h-4 w-4" />
              换一批
            </Button>
          </div>

          {isLoading ? (
            <LoadingSpinner size="lg" className="py-12" text="正在生成推荐…" />
          ) : isError ? (
            <ErrorState message={getErrorMessage(error)} className="py-12" />
          ) : !data || data.length === 0 ? (
            <EmptyState
              title="暂无推荐"
              description="多浏览一些资料，我们会更懂你"
              className="py-12"
            />
          ) : (
            <div className="space-y-2">
              {data.map((material) => (
                <MaterialRow key={material.id} material={material} />
              ))}
            </div>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {isLoggedIn ? '全部资料' : '探索资料'}
        </h2>
        <MaterialInfiniteList />
      </section>
    </div>
  )
}
