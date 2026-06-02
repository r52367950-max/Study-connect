'use client'

import Link from 'next/link'
import { SubjectIcon } from '@/components/study/subject-icon'
import { MaterialInfiniteList } from '@/components/materials/material-infinite-list'
import { Button } from '@/components/ui/button'

export default function PageSubject({ params }: { params: { name: string } }) {
  const subject = decodeURIComponent(params.name)

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-2.5">
        <SubjectIcon subject={subject} className="h-9 w-9 text-sm" />
        <h1 className="text-xl font-bold tracking-tight">{subject}</h1>
      </div>

      <MaterialInfiniteList
        params={{ subject }}
        emptyVariant="bookshelf"
        emptyTitle={`暂无「${subject}」资料`}
        emptyDescription="成为第一个分享这门学科资料的人"
        emptyAction={
          <Button asChild size="sm">
            <Link href="/upload">上传第一份</Link>
          </Button>
        }
      />
    </div>
  )
}
