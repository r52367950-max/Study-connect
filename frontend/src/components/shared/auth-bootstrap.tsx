'use client'

import { useEffect } from 'react'
import { getMe } from '@/lib/api/auth'
import { attemptTokenRefresh } from '@/lib/api/client'
import { initializeAuthBroadcastListener, useAuthStore } from '@/lib/auth-store'

export function AuthBootstrap() {
  const { initialized, setAuth, clearAuth, markInitialized } = useAuthStore()

  useEffect(() => initializeAuthBroadcastListener(), [])

  useEffect(() => {
    if (initialized) return

    // Page refresh recovery flow:
    // 1. /auth/me checks the httpOnly cookie session and restores the user.
    // 2. /auth/refresh mints a new in-memory access token for API requests.
    // 3. If either step fails, the tab becomes an initialized guest.
    void getMe()
      .then(async (user) => {
        setAuth(user, undefined, { broadcast: false })
        await attemptTokenRefresh()
      })
      .catch(() => {
        clearAuth({ broadcast: false })
      })
      .finally(() => {
        markInitialized()
      })
  }, [initialized, setAuth, clearAuth, markInitialized])

  return null
}
