'use client'

import { useAuthStore } from '@/lib/auth-store'
import { logout as logoutApi } from '@/lib/api/auth'
import { resetReportedViewIds } from '@/components/materials/material-row'
import { clearRecentSearches } from '@/components/shared/command-palette'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'

export function useAuth() {
  // Select individual fields rather than the whole store: consumers (every MaterialRow, the
  // sidebar, etc.) then re-render only when user/initialized change — not on every background
  // token refresh, which writes accessToken via setAuth ~every 15 min.
  const user = useAuthStore((s) => s.user)
  const initialized = useAuthStore((s) => s.initialized)
  const setAuth = useAuthStore((s) => s.setAuth)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const queryClient = useQueryClient()
  const router = useRouter()

  const logout = useCallback(() => {
    // Drop cross-user cached data and the per-session impression dedup set
    // BEFORE clearing auth state, so the next user (or the login page) never
    // briefly sees the previous user's favorites / profile / recommendations.
    // Also clear user-scoped recent-searches so the next user can't see the
    // previous user's command-palette search history.
    const userId = user?.id
    queryClient.clear()
    resetReportedViewIds()
    clearRecentSearches(userId)
    void logoutApi().catch(() => undefined)
    clearAuth()
    router.push('/login')
  }, [clearAuth, queryClient, router, user?.id])

  const isLoggedIn = !!user
  const isAdmin = user?.role === 'ADMIN'

  return { user, initialized, isLoggedIn, isAdmin, setAuth, clearAuth, logout }
}
