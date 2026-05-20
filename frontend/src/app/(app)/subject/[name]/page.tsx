'use client'

import { SubjectIcon } from '@/components/study/subject-icon'
import { MaterialInfiniteList } from '@/components/materials/material-infinite-list'

export default function PageSubject({ params }: { params: { name: string } }) {
  const subject = params.name

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-2.5">
        <SubjectIcon subject={subject} className="h-9 w-9 text-sm" />
        <h1 className="text-xl font-bold tracking-tight">{subject}</h1>
      </div>

      <MaterialInfiniteList
        params={{ subject }}
        emptyTitle={`暂无「${subject}」资料`}
      />
    </div>
  )
}
