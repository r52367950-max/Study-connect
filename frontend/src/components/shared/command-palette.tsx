'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Clock, FileText, GraduationCap, Upload } from 'lucide-react'

import { getMaterials } from '@/lib/api/materials'
import { GRADES_BY_STAGE, STAGES, SUBJECTS } from '@/components/onboarding/constants'
import { useCommandPaletteStore } from '@/lib/command-palette-store'
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
} from '@/components/ui/command'

const RECENT_KEY = 'sc-recent-searches'
const MAX_RECENT = 5

function readRecent(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

function writeRecent(items: string[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(items))
  } catch {
    return
  }
}

const GRADE_SHORTCUTS = STAGES.flatMap((stage) =>
  GRADES_BY_STAGE[stage].map((grade) => ({ stage, grade, label: `${stage} · ${grade}` })),
)

export function CommandPalette() {
  const router = useRouter()
  const open = useCommandPaletteStore((s) => s.open)
  const setOpen = useCommandPaletteStore((s) => s.setOpen)

  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [recent, setRecent] = useState<string[]>([])

  // ⌘K / Ctrl+K toggles the palette from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        const store = useCommandPaletteStore.getState()
        store.setOpen(!store.open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Hydrate recent searches from localStorage (client-only).
  useEffect(() => {
    setRecent(readRecent())
  }, [])

  // Debounce the material search (200ms).
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 200)
    return () => clearTimeout(timer)
  }, [query])

  const { data, isFetching } = useQuery({
    queryKey: ['command-materials', debounced],
    queryFn: () => getMaterials({ q: debounced, pageSize: 8 }),
    enabled: open && debounced.length >= 1,
    staleTime: 30_000,
  })
  const materials = data?.items ?? []

  const q = query.trim()
  const filteredSubjects = SUBJECTS.filter((s) => !q || s.includes(q))
  const filteredGrades = GRADE_SHORTCUTS.filter((g) => !q || g.label.includes(q))

  const pushRecent = (term: string) => {
    const t = term.trim()
    if (!t) return
    setRecent((prev) => {
      const next = [t, ...prev.filter((x) => x !== t)].slice(0, MAX_RECENT)
      writeRecent(next)
      return next
    })
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) setQuery('')
  }

  const go = (path: string) => {
    pushRecent(query)
    setQuery('')
    setOpen(false)
    router.push(path)
  }

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange} shouldFilter={false}>
      <CommandInput value={query} onValueChange={setQuery} placeholder="搜索资料、学科或年级…" />
      <CommandList>
        {q === '' && recent.length > 0 && (
          <CommandGroup heading="最近搜索">
            {recent.map((term, i) => (
              <CommandItem
                key={`recent-${i}`}
                value={`recent-${i}-${term}`}
                onSelect={() => setQuery(term)}
              >
                <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{term}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {debounced.length >= 1 && (
          <>
            {isFetching && materials.length === 0 && <CommandLoading>搜索中…</CommandLoading>}
            {materials.length > 0 && (
              <CommandGroup heading="资料">
                {materials.map((m) => (
                  <CommandItem
                    key={m.id}
                    value={`material-${m.id}`}
                    onSelect={() => go(`/materials/${m.id}`)}
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{m.title}</span>
                    {m.subject && (
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {m.subject}
                      </span>
                    )}
                    {m.grade && (
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {m.grade}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {!isFetching && materials.length === 0 && (
              <CommandGroup heading="资料">
                <CommandItem value="materials-empty" onSelect={() => go('/upload')}>
                  <Upload className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">没有找到相关资料，试试上传一份？</span>
                </CommandItem>
              </CommandGroup>
            )}
          </>
        )}

        {filteredSubjects.length > 0 && (
          <CommandGroup heading="学科">
            {filteredSubjects.map((s) => (
              <CommandItem key={s} value={`subject-${s}`} onSelect={() => go(`/subject/${s}`)}>
                <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{s}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {filteredGrades.length > 0 && (
          <CommandGroup heading="年级">
            {filteredGrades.map((g) => (
              <CommandItem
                key={`${g.stage}-${g.grade}`}
                value={`grade-${g.stage}-${g.grade}`}
                onSelect={() => go(`/grade/${g.stage}/${g.grade}`)}
              >
                <GraduationCap className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{g.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
