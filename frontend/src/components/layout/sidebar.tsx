'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  BookOpen,
  Home,
  TrendingUp,
  Star,
  ChevronRight,
  LogIn,
  Search,
  MoreVertical,
  User,
  Settings,
  LogOut,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useProfile } from '@/hooks/use-profile'
import { useFavorites } from '@/hooks/use-favorites'
import { useCommandPaletteStore } from '@/lib/command-palette-store'
import { useSidebarStore } from '@/lib/sidebar-store'
import { SUBJECTS, STAGES, GRADES_BY_STAGE } from '@/components/onboarding/constants'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { identifierLabel } from '@/lib/user-display'
import { cn } from '@/lib/utils'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  )
}

/**
 * The sidebar's inner column, shared by the desktop rail and the mobile drawer.
 * `onNavigate` lets the drawer close itself when a link/search is activated.
 */
function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const decoded = (() => {
    try {
      return decodeURIComponent(pathname)
    } catch {
      return pathname
    }
  })()
  const { isLoggedIn, user, logout } = useAuth()
  const { data: profile } = useProfile()
  const { favoritesCount } = useFavorites()
  const setCommandOpen = useCommandPaletteStore((s) => s.setOpen)
  const [openStages, setOpenStages] = useState<Record<string, boolean>>({})
  const autoExpanded = useRef(false)

  // Default-expand every stage the user teaches when they have more than one.
  useEffect(() => {
    if (autoExpanded.current) return
    const stages = profile?.stages ?? []
    if (stages.length <= 1) return
    autoExpanded.current = true
    setOpenStages((prev) => {
      const next = { ...prev }
      for (const stage of stages) {
        if ((STAGES as readonly string[]).includes(stage)) next[stage] = true
      }
      return next
    })
  }, [profile?.stages])

  const navItem = (href: string, label: string, icon: React.ReactNode, badge?: number) => {
    const active = href === '/' ? decoded === '/' : decoded === href || decoded.startsWith(`${href}/`)
    return (
      <Link
        href={href}
        onClick={onNavigate}
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
          active ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60',
        )}
      >
        {icon}
        <span className="flex-1 truncate">{label}</span>
        {badge != null && badge > 0 && (
          <span className="rounded-full bg-foreground/10 px-1.5 text-[11px] tabular-nums">{badge}</span>
        )}
      </Link>
    )
  }

  const handleLogout = () => {
    onNavigate?.()
    logout()
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Brand */}
      <Link
        href="/"
        onClick={onNavigate}
        className="flex items-center gap-2 px-4 py-4 font-semibold tracking-tight"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground">
          <BookOpen className="h-4 w-4 text-background" />
        </div>
        <span className="text-[15px]">StudyConnect</span>
      </Link>

      {/* Search trigger (opens ⌘K command palette) */}
      <button
        type="button"
        onClick={() => {
          onNavigate?.()
          setCommandOpen(true)
        }}
        className="mx-2 mb-2 flex items-center gap-2 rounded-md border border-input bg-muted/30 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/60"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">搜索资料…</span>
        <kbd className="rounded border bg-background px-1 text-[10px]">⌘K</kbd>
      </button>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        <div className="space-y-0.5">
          {navItem('/', '首页', <Home className="h-4 w-4" />)}
          {navItem('/rank', '热门榜单', <TrendingUp className="h-4 w-4" />)}
          {navItem('/favorites', '我的收藏', <Star className="h-4 w-4" />, favoritesCount || undefined)}
        </div>

        <SectionLabel>学科</SectionLabel>
        <div className="space-y-0.5">
          {SUBJECTS.map((subject) => {
            const href = `/subject/${subject}`
            const active = decoded === href
            return (
              <Link
                key={subject}
                href={href}
                onClick={onNavigate}
                className={cn(
                  'block rounded-md px-3 py-1.5 text-sm transition-colors',
                  active ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60',
                )}
              >
                {subject}
              </Link>
            )
          })}
        </div>

        <SectionLabel>年级</SectionLabel>
        <div className="space-y-0.5">
          {STAGES.map((stage) => {
            const open = openStages[stage] ?? false
            return (
              <div key={stage}>
                <button
                  type="button"
                  onClick={() => setOpenStages((prev) => ({ ...prev, [stage]: !open }))}
                  className="flex w-full items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/60"
                >
                  <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-90')} />
                  <span className="flex-1 text-left">{stage}</span>
                </button>
                {open && (
                  <div className="ml-4 space-y-0.5 border-l pl-2">
                    {GRADES_BY_STAGE[stage].map((grade) => {
                      const href = `/grade/${stage}/${grade}`
                      const active = decoded === href
                      return (
                        <Link
                          key={grade}
                          href={href}
                          onClick={onNavigate}
                          className={cn(
                            'block rounded-md px-3 py-1 text-sm transition-colors',
                            active
                              ? 'bg-accent font-medium text-accent-foreground'
                              : 'text-muted-foreground hover:bg-accent/60',
                          )}
                        >
                          {grade}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </nav>

      {/* User footer */}
      <div className="border-t p-3">
        {isLoggedIn ? (
          <div className="flex items-center gap-1">
            <Link
              href="/profile"
              onClick={onNavigate}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/60"
            >
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-foreground text-xs text-background">
                  {(profile?.displayName ?? user?.username ?? 'U').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{profile?.displayName ?? user?.username}</p>
                {user && (
                  <p className="truncate text-xs text-muted-foreground">{identifierLabel(user)}</p>
                )}
              </div>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="用户菜单"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" sideOffset={8} className="w-48">
                <DropdownMenuItem
                  onSelect={() => {
                    onNavigate?.()
                    router.push('/profile')
                  }}
                >
                  <User className="h-4 w-4" />
                  个人中心
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    onNavigate?.()
                    router.push('/profile#onboarding')
                  }}
                >
                  <Settings className="h-4 w-4" />
                  修改入职信息
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    void handleLogout()
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <Link
            href="/login"
            onClick={onNavigate}
            className="flex items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent/60"
          >
            <LogIn className="h-4 w-4" />
            登录 / 注册
          </Link>
        )}
      </div>
    </div>
  )
}

/** Desktop rail — fixed and inline at `lg` and up. */
export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r lg:block">
      <SidebarContent />
    </aside>
  )
}

/** Mobile drawer — opened from the topbar hamburger below `lg`. */
export function MobileSidebar() {
  const mobileOpen = useSidebarStore((s) => s.mobileOpen)
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen)

  // Close the drawer once the viewport reaches `lg` (where the inline rail takes
  // over). Otherwise resizing a wide-open drawer up to desktop leaves the
  // overlay + Radix focus trap lingering over the desktop layout.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const closeIfDesktop = () => {
      if (mq.matches) setMobileOpen(false)
    }
    closeIfDesktop()
    mq.addEventListener('change', closeIfDesktop)
    return () => mq.removeEventListener('change', closeIfDesktop)
  }, [setMobileOpen])

  return (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <SheetContent side="left" className="w-72 p-0">
        <SheetTitle className="sr-only">导航</SheetTitle>
        <SidebarContent onNavigate={() => setMobileOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
