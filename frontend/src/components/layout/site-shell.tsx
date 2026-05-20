'use client'

import { usePathname } from 'next/navigation'
import { Navbar } from '@/components/layout/navbar'

const DIRB_ENABLED = process.env.NEXT_PUBLIC_DIRB_ENABLED !== 'false'

// Routes owned by the (app) route group, which renders its own DirB chrome
// (sidebar + topbar). Note `/materials` (exact) is a DirB route, but the
// `/materials/[id]` detail page is not — it keeps the classic navbar.
function isDirbRoute(pathname: string): boolean {
  if (pathname === '/' || pathname === '/materials') return true
  return ['/rank', '/favorites', '/subject/', '/grade/'].some(
    (p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : `${p}/`),
  )
}

/**
 * Decides whether to render the classic top Navbar chrome. On DirB routes (when
 * the feature flag is on) the (app) layout supplies its own sidebar/topbar, so
 * the Navbar is omitted; every other route keeps the original navbar + footer.
 */
export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (DIRB_ENABLED && isDirbRoute(pathname)) {
    return <>{children}</>
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-7xl px-4 py-6 sm:px-6">
        {children}
      </main>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} StudyConnect · 学习资料共享平台
      </footer>
    </>
  )
}
