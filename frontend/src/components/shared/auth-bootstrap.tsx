'use client'

import { useEffect } from 'react'
import { getMe } from '@/lib/api/auth'
import { useAuthStore } from '@/lib/auth-store'

export function AuthBootstrap() {
  const { initialized, setAuth, clearAuth, markInitialized } = useAuthStore()

  useEffect(() => {
    if (initialized) return

    void getMe()
      .then((user) => {
        setAuth(user)
      })
      .catch(() => {
        clearAuth()
      })
      .finally(() => {
        markInitialized()
      })
  }, [initialized, setAuth, clearAuth, markInitialized])

  return null
}
