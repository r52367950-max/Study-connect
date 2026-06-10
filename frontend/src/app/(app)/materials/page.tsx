'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { getMaterials } from '@/lib/api/materials'
import { getErrorMessage } from '@/lib/api/client'
import type { MaterialSearchParams } from '@/types'
import { MaterialCard } from '@/components/materials/material-card'
import { MaterialCardGridSkeleton } from '@/components/materials/material-skeletons'
import { FilterBar } from '@/components/materials/filter-bar'
import { Button } from '@/components/ui/button'
import { Pagination } from '@/components/shared/pagination'
import { ContentTransition } from '@/components/shared/page-transition'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'

const DEFAULT_PAGE_SIZE = 12

export default function MaterialsPage() {
  const [params, setParams] = useState<MaterialSearchParams>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    sort: 'latest',
  })
  // Committed search params (only update on search button click / filter change)
  const [committedParams, setCommittedParams] = useState(params)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['materials', committedParams],
    queryFn: () => getMaterials(committedParams),
  })

  const handleParamsChange = useCallback((updates: Partial<MaterialSearchParams>) => {
    setParams((prev) => ({ ...prev, ...updates }))
    // Filter/sort changes apply immediately; keyword only on explicit search
    if (!('q' in updates)) {
      setCommittedParams((prev) => ({ ...prev, ...updates }))
    }
  }, [])

  const handleSearch = useCallback(() => {
    setCommittedParams((prev) => ({ ...prev, q: params.q, page: 1 }))
  }, [params.q])

  const handlePageChange = useCallback((page: number) => {
    setParams((prev) => ({ ...prev, page }))
    setCommittedParams((prev) => ({ ...prev, page }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleResetFilters = useCallback(() => {
    const reset: MaterialSearchParams = { page: 1, pageSize: DEFAULT_PAGE_SIZE, sort: 'latest' }
    setParams(reset)
    setCommittedParams(reset)
  }, [])

  const hasActiveFilters = !!(
    committedParams.q ||
    committedParams.stage ||
    committedParams.subject
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">资料库</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          探索优质学习资料，按学段、学科精准筛选
        </p>
      </div>

      {/* Filters */}
      <FilterBar params={params} onChange={handleParamsChange} onSearch={handleSearch} onReset={handleResetFilters} />

      {/* Results */}
      <ContentTransition isLoading={isLoading} skeleton={<MaterialCardGridSkeleton />}>
        {isError ? (
          <ErrorState
            message={getErrorMessage(error)}
            onRetry={() => refetch()}
            className="py-20"
          />
        ) : !data?.items.length ? (
          <EmptyState
            variant="search"
            title="未找到相关资料"
            description="换个关键词或筛选条件，或上传一份新资料"
            className="py-20"
            action={
              <>
                {hasActiveFilters && (
                  <Button variant="outline" size="sm" onClick={handleResetFilters}>
                    清除筛选
                  </Button>
                )}
                <Button asChild size="sm">
                  <Link href="/upload">上传一份</Link>
                </Button>
              </>
            }
          />
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                共 <span className="font-medium text-foreground">{data.total}</span> 份资料
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {data.items.map((m) => (
                <MaterialCard key={m.id} material={m} />
              ))}
            </div>

            <Pagination
              page={committedParams.page ?? 1}
              total={data.total}
              pageSize={committedParams.pageSize ?? DEFAULT_PAGE_SIZE}
              onPageChange={handlePageChange}
              className="pt-4"
            />
          </div>
        )}
      </ContentTransition>
    </div>
  )
}
