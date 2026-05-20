'use client'

import { MaterialInfiniteList } from '@/components/materials/material-infinite-list'

export default function PageGrade({
  params,
}: {
  params: { stage: string; grade: string }
}) {
  const { stage, grade } = params

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-bold tracking-tight">
        {stage} · {grade}
      </h1>

      <MaterialInfiniteList
        params={{ stage, grade }}
        emptyTitle={`暂无「${stage} ${grade}」资料`}
      />
    </div>
  )
}
