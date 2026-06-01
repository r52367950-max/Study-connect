'use client'

import { useAuthStore } from '@/lib/auth-store'
import { logout as logoutApi } from '@/lib/api/auth'
import { resetReportedViewIds } from '@/components/materials/material-row'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'

export function useAuth() {
  const { user, initialized, setAuth, clearAuth } = useAuthStore()
  const queryClient = useQueryClient()
  const router = useRouter()

  const logout = useCallback(() => {
    // Drop cross-user cached data and the per-session impression dedup set
    // BEFORE clearing auth state, so the next user (or the login page) never
    // briefly sees the previous user's favorites / profile / recommendations.
    queryClient.clear()
    resetReportedViewIds()
    void logoutApi().catch(() => undefined)
    clearAuth()
    router.push('/login')
  }, [clearAuth, queryClient, router])

  const isLoggedIn = !!user
  const isAdmin = user?.role === 'ADMIN'

  return { user, initialized, isLoggedIn, isAdmin, setAuth, clearAuth, logout }
}
