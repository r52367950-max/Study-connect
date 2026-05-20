'use client'

import { useEffect } from 'react'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { toast } from '@/components/ui/use-toast'

const DIRB_ENABLED = process.env.NEXT_PUBLIC_DIRB_ENABLED !== 'false'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Surface the admin-guard 403 redirect (`/?forbidden=1`) as a toast.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (url.searchParams.get('forbidden') === '1') {
      toast({
        variant: 'destructive',
        title: '无管理员权限',
        description: '您的账号没有管理员权限，已为您跳转至首页',
      })
      url.searchParams.delete('forbidden')
      window.history.replaceState({}, '', url.pathname + url.search)
    }
  }, [])

  // Feature flag off → fall back to the classic layout (Navbar via SiteShell).
  if (!DIRB_ENABLED) {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto px-6 py-6">{children}</main>
      </div>
    </div>
  )
}
