'use client'

import { useAuthStore } from '@/lib/auth-store'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'

export function useAuth() {
  const { token, user, setAuth, clearAuth } = useAuthStore()
  const router = useRouter()

  const logout = useCallback(() => {
    clearAuth()
    router.push('/login')
  }, [clearAuth, router])

  const isLoggedIn = !!token && !!user
  const isAdmin = user?.role === 'ADMIN'

  return { token, user, isLoggedIn, isAdmin, setAuth, clearAuth, logout }
}
