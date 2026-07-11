'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getFavoriteIds, type FavoriteIds } from '@/lib/api/favorites'
import { useAuthStore } from '@/lib/auth-store'

/**
 * Full favorite-id set + total count for the current user. Skipped when not
 * logged in. Backs the star toggle on every <MaterialRow> and the sidebar
 * badge via the ['favorites', 'ids'] key; the favorites PAGE fetches its own
 * paginated list under ['favorites', 'list', page]. Both share the
 * ['favorites'] prefix so one invalidation refreshes everything.
 */
export function useFavorites() {
  const user = useAuthStore((s) => s.user)
  const query = useQuery<FavoriteIds>({
    queryKey: ['favorites', 'ids'],
    queryFn: getFavoriteIds,
    enabled: Boolean(user),
    staleTime: 60 * 1000,
  })

  const favoriteIds = useMemo(
    () => new Set(query.data?.items ?? []),
    [query.data],
  )

  return { ...query, favoriteIds, favoritesCount: query.data?.total ?? 0 }
}
