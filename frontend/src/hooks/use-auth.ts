'use client'

import { useAuthStore } from '@/lib/auth-store'
import { logout as logoutApi } from '@/lib/api/auth'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'

export function useAuth() {
  const { user, initialized, setAuth, clearAuth } = useAuthStore()
  const router = useRouter()

  const logout = useCallback(() => {
    void logoutApi().catch(() => undefined)
    clearAuth()
    router.push('/login')
  }, [clearAuth, router])

  const isLoggedIn = !!user
  const isAdmin = user?.role === 'ADMIN'

  return { user, initialized, isLoggedIn, isAdmin, setAuth, clearAuth, logout }
}
