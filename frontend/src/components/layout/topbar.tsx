'use client'

import { useRouter, usePathname } from 'next/navigation'
import { Upload, FilePlus2, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSidebarStore } from '@/lib/sidebar-store'
import { toast } from '@/components/ui/use-toast'

function deriveTitle(pathname: string): string {
  let decoded = pathname
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    /* keep raw */
  }
  if (decoded === '/') return '推荐资料'
  if (decoded.startsWith('/rank')) return '热门榜单'
  if (decoded.startsWith('/favorites')) return '我的收藏'
  if (decoded.startsWith('/materials')) return '全部资料'
  if (decoded.startsWith('/subject/')) return decoded.split('/')[2] ?? '学科'
  if (decoded.startsWith('/grade/')) {
    const parts = decoded.split('/')
    return [parts[2], parts[3]].filter(Boolean).join(' · ') || '年级'
  }
  return 'StudyConnect'
}

export function Topbar() {
  const router = useRouter()
  const pathname = usePathname()
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen)

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="打开导航"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h2 className="truncate text-sm font-semibold tracking-tight">{deriveTitle(pathname)}</h2>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.push('/upload')}>
          <Upload className="h-4 w-4" />
          上传资料
        </Button>
        <Button
          size="sm"
          onClick={() => toast({ title: '演示模式，敬请期待' })}
        >
          <FilePlus2 className="h-4 w-4" />
          新建组卷
        </Button>
      </div>
    </header>
  )
}
