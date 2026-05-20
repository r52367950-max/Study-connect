'use client'

import { useState } from 'react'
import type { MaterialSort } from '@/types'
import { MaterialInfiniteList } from '@/components/materials/material-infinite-list'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function PageRank() {
  const [sort, setSort] = useState<MaterialSort>('downloads')

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-bold tracking-tight">热门榜单</h1>

      <Tabs value={sort} onValueChange={(v) => setSort(v as MaterialSort)}>
        <TabsList>
          <TabsTrigger value="downloads">最多下载</TabsTrigger>
          <TabsTrigger value="rating">最高评分</TabsTrigger>
        </TabsList>
      </Tabs>

      <MaterialInfiniteList params={{ sort }} emptyTitle="榜单暂无资料" />
    </div>
  )
}
