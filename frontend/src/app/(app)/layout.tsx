'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sidebar, MobileSidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { CommandPalette } from '@/components/shared/command-palette'
import { GradeUpgradeDialog } from '@/components/shared/grade-upgrade-dialog'
import { toast } from '@/components/ui/use-toast'

const DIRB_ENABLED = process.env.NEXT_PUBLIC_DIRB_ENABLED !== 'false'

/**
 * Surfaces the admin-guard 403 redirect (`/?forbidden=1`) as a toast. Reads the
 * live search params so it re-fires every time the user is kicked back here,
 * and clears the query via `router.replace('/')` so it doesn't repeat on
 * refresh. Wrapped in <Suspense> per Next's `useSearchParams` requirement.
 */
function ForbiddenToast() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get('forbidden') !== '1') return
    toast({
      variant: 'destructive',
      title: '无管理员权限',
      description: '您的账号没有管理员权限，已为您跳转至首页',
    })
    router.replace('/')
  }, [searchParams, router])

  return null
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const forbiddenToast = (
    <Suspense fallback={null}>
      <ForbiddenToast />
    </Suspense>
  )

  // Feature flag off → fall back to the classic layout (Navbar via SiteShell).
  if (!DIRB_ENABLED) {
    return (
      <>
        {forbiddenToast}
        {children}
      </>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {forbiddenToast}
      <Sidebar />
      <MobileSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-6">{children}</main>
      </div>
      <CommandPalette />
      <GradeUpgradeDialog />
    </div>
  )
}
