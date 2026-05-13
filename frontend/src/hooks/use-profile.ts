'use client'

import { useQuery } from '@tanstack/react-query'
import { getMyProfile } from '@/lib/api/users'
import { useAuthStore } from '@/lib/auth-store'

/**
 * Fetch the current user's onboarding profile. Skipped when not logged in.
 * Phase-3 DirB pages should use this in place of the prototype's UserCtx.
 */
export function useProfile() {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: ['profile'],
    queryFn: getMyProfile,
    enabled: Boolean(user),
    staleTime: 60 * 1000,
  })
}
