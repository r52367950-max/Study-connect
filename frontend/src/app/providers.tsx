'use client'

import { useEffect, useRef, useState } from 'react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/toaster'
import { AuthBootstrap } from '@/components/shared/auth-bootstrap'
import { OnboardingGate } from '@/components/shared/onboarding-gate'
import { resetReportedViewIds } from '@/components/materials/material-row'
import { useAuthStore } from '@/lib/auth-store'

/**
 * Clear React Query cache + per-session impression dedup whenever the
 * authenticated user changes (logout, or login as a different account in the
 * same tab). use-auth.logout already does this synchronously, but switching
 * accounts via setAuth without an explicit logout also needs to clear, so
 * account B never sees account A's `['favorites']` / `['profile']` data.
 */
function AuthCacheSync() {
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const prev = useRef<string | null>(null)
  useEffect(() => {
    // Skip the initial null → A bootstrap transition (nothing to clear, and we
    // don't want to drop the queries the page is currently warming).
    if (prev.current != null && prev.current !== userId) {
      queryClient.clear()
      resetReportedViewIds()
    }
    prev.current = userId
  }, [userId, queryClient])
  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,        // 1 min
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <AuthBootstrap />
      <AuthCacheSync />
      <OnboardingGate />
      {children}
      <Toaster />
    </QueryClientProvider>
  )
}
