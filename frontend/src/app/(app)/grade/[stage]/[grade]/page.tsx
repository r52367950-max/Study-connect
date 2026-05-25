'use client'

import Link from 'next/link'
import { MaterialInfiniteList } from '@/components/materials/material-infinite-list'
import { Button } from '@/components/ui/button'

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
        emptyVariant="bookshelf"
        emptyTitle={`暂无「${stage} ${grade}」资料`}
        emptyDescription="成为第一个分享这个年级资料的人"
        emptyAction={
          <Button asChild size="sm">
            <Link href="/upload">上传第一份</Link>
          </Button>
        }
      />
    </div>
  )
}
