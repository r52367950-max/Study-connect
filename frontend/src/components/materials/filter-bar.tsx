'use client'

import { useCallback } from 'react'
import { Search, SlidersHorizontal } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import type { MaterialSearchParams, MaterialSort } from '@/types'

const STAGE_OPTIONS = ['小学', '初中', '高中', '大学', '职教']
const SUBJECT_OPTIONS = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治', '信息技术']
const SORT_OPTIONS: { value: MaterialSort; label: string }[] = [
  { value: 'latest', label: '最新发布' },
  { value: 'downloads', label: '下载最多' },
  { value: 'rating', label: '评分最高' },
]

interface FilterBarProps {
  params: MaterialSearchParams
  onChange: (params: Partial<MaterialSearchParams>) => void
  onSearch: () => void
}

export function FilterBar({ params, onChange, onSearch }: FilterBarProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') onSearch()
    },
    [onSearch],
  )

  const handleSelect = (key: keyof MaterialSearchParams) => (value: string) => {
    onChange({ [key]: value === '__all__' ? undefined : value, page: 1 })
  }

  const handleReset = () => {
    onChange({ q: '', stage: undefined, subject: undefined, sort: undefined, page: 1 })
  }

  const hasFilters = !!(params.q || params.stage || params.subject)

  return (
    <div className="space-y-3">
      {/* Search row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索资料标题、描述…"
            className="pl-9"
            value={params.q ?? ''}
            onChange={(e) => onChange({ q: e.target.value, page: 1 })}
            onKeyDown={handleKeyDown}
          />
        </div>
        <Button onClick={onSearch} className="shrink-0">
          搜索
        </Button>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />

        <Select
          value={params.stage ?? '__all__'}
          onValueChange={handleSelect('stage')}
        >
          <SelectTrigger className="h-8 w-[110px] text-xs">
            <SelectValue placeholder="学段" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">全部学段</SelectItem>
            {STAGE_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={params.subject ?? '__all__'}
          onValueChange={handleSelect('subject')}
        >
          <SelectTrigger className="h-8 w-[110px] text-xs">
            <SelectValue placeholder="学科" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">全部学科</SelectItem>
            {SUBJECT_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={params.sort ?? 'latest'}
          onValueChange={(v) => onChange({ sort: v as MaterialSort, page: 1 })}
        >
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue placeholder="排序" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={handleReset}>
            清除筛选
          </Button>
        )}
      </div>
    </div>
  )
}
