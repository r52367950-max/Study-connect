'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { useProfile } from '@/hooks/use-profile'

// Routes that must remain accessible without an onboarded profile.
const ONBOARDING_EXEMPT_PREFIXES = ['/onboarding', '/login', '/register']

/**
 * After auth bootstrap, if the user is logged in but has not finished
 * onboarding, redirect them to `/onboarding` (unless already on a path that
 * the onboarding flow itself depends on).
 */
export function OnboardingGate() {
  const router = useRouter()
  const pathname = usePathname()
  const { isLoggedIn, initialized } = useAuth()
  const { data: profile } = useProfile()

  useEffect(() => {
    if (!initialized || !isLoggedIn) return
    if (!profile) return
    if (profile.onboardedAt) return
    if (!pathname) return
    if (ONBOARDING_EXEMPT_PREFIXES.some((p) => p === pathname || pathname.startsWith(`${p}/`))) {
      return
    }
    const redirect = encodeURIComponent(pathname)
    router.replace(`/onboarding?redirect=${redirect}`)
  }, [initialized, isLoggedIn, profile, pathname, router])

  return null
}
