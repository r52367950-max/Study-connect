'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { searchSchools } from '@/lib/api/schools'
import type { SchoolSummary } from '@/types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface SchoolPickerProps {
  city?: string
  selected: SchoolSummary | null
  freeText: string
  onSelect: (school: SchoolSummary | null) => void
  onFreeTextChange: (value: string) => void
}

/**
 * Minimal school picker for onboarding (Phase 2).
 * Phase 4 will replace this with a polished combobox + pinyin search.
 */
export function SchoolPicker({
  city,
  selected,
  freeText,
  onSelect,
  onFreeTextChange,
}: SchoolPickerProps) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [freeMode, setFreeMode] = useState(Boolean(freeText) && !selected)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(timer)
  }, [query])

  const { data, isFetching } = useQuery({
    queryKey: ['schools', city ?? '', debounced],
    queryFn: () => searchSchools({ city: city || undefined, q: debounced || undefined, limit: 10 }),
    enabled: !freeMode && (Boolean(city) || debounced.length > 0),
    staleTime: 60 * 1000,
  })

  if (freeMode) {
    return (
      <div className="space-y-2">
        <Input
          placeholder="请输入学校全称（如：北京市第十一中学）"
          value={freeText}
          onChange={(e) => onFreeTextChange(e.target.value)}
          maxLength={64}
        />
        <button
          type="button"
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => {
            setFreeMode(false)
            onFreeTextChange('')
          }}
        >
          返回从列表选择
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Input
        placeholder="搜索学校名称或拼音首字母"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {selected && (
        <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <span>
            已选：<span className="font-medium">{selected.name}</span>
            <span className="ml-1 text-xs text-muted-foreground">· {selected.city}</span>
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => onSelect(null)}>
            更换
          </Button>
        </div>
      )}
      {!selected && data && data.length > 0 && (
        <ul className="max-h-48 overflow-y-auto rounded-md border bg-background">
          {data.map((school) => (
            <li key={school.id}>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted',
                )}
                onClick={() => onSelect(school)}
              >
                <span>{school.name}</span>
                <span className="text-xs text-muted-foreground">{school.city}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!selected && !isFetching && debounced && data && data.length === 0 && (
        <p className="text-xs text-muted-foreground">未找到匹配的学校</p>
      )}
      <button
        type="button"
        className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        onClick={() => {
          setFreeMode(true)
          onSelect(null)
        }}
      >
        找不到我的学校？手动填写
      </button>
    </div>
  )
}
