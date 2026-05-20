'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as Popover from '@radix-ui/react-popover'
import { ChevronsUpDown, Loader2 } from 'lucide-react'

import { searchSchools } from '@/lib/api/schools'
import type { SchoolSummary } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface SchoolComboboxProps {
  city?: string
  selected: SchoolSummary | null
  freeText: string
  onSelect: (school: SchoolSummary | null) => void
  onFreeTextChange: (value: string) => void
}

/**
 * Onboarding school picker: a Popover + debounced search combobox backed by
 * `GET /schools` (supports pinyin-initial search, e.g. `bjdy`). Falls back to a
 * free-text input when the school isn't in the list.
 */
export function SchoolCombobox({
  city,
  selected,
  freeText,
  onSelect,
  onFreeTextChange,
}: SchoolComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [freeMode, setFreeMode] = useState(Boolean(freeText) && !selected)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(timer)
  }, [query])

  const { data, isFetching } = useQuery({
    queryKey: ['schools', city ?? '', debounced],
    queryFn: () => searchSchools({ city: city || undefined, q: debounced || undefined, limit: 10 }),
    enabled: open && !freeMode && (Boolean(city) || debounced.length > 0),
    staleTime: 60 * 1000,
  })
  const results = data ?? []

  const pick = (school: SchoolSummary) => {
    onSelect(school)
    setQuery('')
    setOpen(false)
  }

  const enterFreeMode = () => {
    onSelect(null)
    setQuery('')
    setFreeMode(true)
    setOpen(false)
  }

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
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button type="button" variant="outline" className="w-full justify-between font-normal">
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? selected.name : '搜索学校名称或拼音…'}
          </span>
          {selected ? (
            <span className="ml-2 shrink-0 text-xs text-muted-foreground">更换</span>
          ) : (
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            inputRef.current?.focus()
          }}
          className="z-50 w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        >
          <div className="border-b p-2">
            <Input
              ref={inputRef}
              placeholder="搜索学校名称或拼音…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {isFetching && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                搜索中…
              </div>
            )}
            {!isFetching && results.length > 0 && (
              <ul>
                {results.map((school) => (
                  <li key={school.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => pick(school)}
                    >
                      <span className="truncate">{school.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{school.city}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!isFetching && results.length === 0 && (debounced.length > 0 || Boolean(city)) && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">未找到匹配的学校</p>
            )}
            {!isFetching && results.length === 0 && debounced.length === 0 && !city && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                输入学校名称或拼音首字母开始搜索
              </p>
            )}
          </div>
          <div className="border-t p-1">
            <button
              type="button"
              className="w-full rounded-sm px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent"
              onClick={enterFreeMode}
            >
              找不到我的学校？手动填写
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
