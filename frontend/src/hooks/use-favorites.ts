'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getFavorites } from '@/lib/api/favorites'
import { useAuthStore } from '@/lib/auth-store'

/**
 * Fetch the current user's favorited materials. Skipped when not logged in.
 * Backs both the favorites page and the star toggle on every <MaterialRow>,
 * so the sidebar count and star state stay in sync via the ['favorites'] key.
 */
export function useFavorites() {
  const user = useAuthStore((s) => s.user)
  const query = useQuery({
    queryKey: ['favorites'],
    queryFn: getFavorites,
    enabled: Boolean(user),
    staleTime: 60 * 1000,
  })

  const favoriteIds = useMemo(
    () => new Set((query.data ?? []).map((m) => m.id)),
    [query.data],
  )

  return { ...query, favoriteIds }
}
