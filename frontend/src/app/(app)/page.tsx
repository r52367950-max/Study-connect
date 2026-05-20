'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { getRecommendedMaterials } from '@/lib/api/recommendations'
import { getErrorMessage } from '@/lib/api/client'
import { useAuth } from '@/hooks/use-auth'
import { MaterialRow } from '@/components/materials/material-row'
import { MaterialRowListSkeleton } from '@/components/materials/material-skeletons'
import { MaterialInfiniteList } from '@/components/materials/material-infinite-list'
import { ContentTransition } from '@/components/shared/page-transition'
import { ErrorState } from '@/components/shared/error-state'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'

// A/B exposure: "换一批" re-requests recommendations under the v2 ranker.
const RESHUFFLE_RANKER = 'ranker_v2'

export default function PageHome() {
  const { isLoggedIn } = useAuth()
  const queryClient = useQueryClient()
  const [ranker, setRanker] = useState<string | undefined>(undefined)

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['recommendations', ranker],
    queryFn: () => getRecommendedMaterials(20, ranker),
    enabled: isLoggedIn,
  })

  const handleReshuffle = () => {
    if (ranker !== RESHUFFLE_RANKER) {
      setRanker(RESHUFFLE_RANKER)
    } else {
      void queryClient.invalidateQueries({ queryKey: ['recommendations', RESHUFFLE_RANKER] })
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {isLoggedIn && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold tracking-tight">推荐资料</h1>
            <Button variant="outline" size="sm" disabled={isFetching} onClick={handleReshuffle}>
              <RefreshCw className="h-4 w-4" />
              换一批
            </Button>
          </div>

          <ContentTransition isLoading={isLoading} skeleton={<MaterialRowListSkeleton count={3} />}>
            {isError ? (
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
          </ContentTransition>
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
