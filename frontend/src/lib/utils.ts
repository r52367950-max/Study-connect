import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow, format } from 'date-fns'
import { zhCN } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRelativeTime(dateString: string): string {
  try {
    return formatDistanceToNow(new Date(dateString), {
      addSuffix: true,
      locale: zhCN,
    })
  } catch {
    return dateString
  }
}

export function formatDate(dateString: string): string {
  try {
    return format(new Date(dateString), 'yyyy-MM-dd', { locale: zhCN })
  } catch {
    return dateString
  }
}

export function formatScore(score: number | null | undefined): string {
  if (score == null) return '暂无评分'
  return score.toFixed(1)
}

/** Detect file type label from MIME or filename */
export function getFileTypeLabel(fileKey: string): string {
  const ext = fileKey.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    pdf: 'PDF',
    doc: 'Word',
    docx: 'Word',
    ppt: 'PPT',
    pptx: 'PPT',
    zip: 'ZIP',
    txt: 'TXT',
  }
  return (map[ext] ?? ext.toUpperCase()) || '文件'
}

// Reject absolute URLs ("https://evil"), protocol-relative URLs ("//evil"),
// and Windows-style backslash variants ("/\\evil"). Only same-origin paths
// (starting with a single "/" and a non-slash/backslash char) pass through.
export function safeRedirect(target: string | null | undefined): string {
  if (!target || typeof target !== 'string') return '/'
  if (!target.startsWith('/')) return '/'
  if (target.startsWith('//') || target.startsWith('/\\')) return '/'
  return target
}

export function buildQueryString(params: Record<string, unknown>): string {
  const filtered = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  )
  if (!filtered.length) return ''
  return '?' + new URLSearchParams(filtered.map(([k, v]) => [k, String(v)])).toString()
}
