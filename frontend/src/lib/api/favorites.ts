import type { MaterialRowItem } from '@/types'
import { apiClient } from './client'

interface FavoriteEntry {
  id: string
  favoritedAt: string
  material: MaterialRowItem
}

export interface FavoritesPage {
  items: MaterialRowItem[]
  page: number
  pageSize: number
  total: number
}

export interface FavoriteIds {
  items: string[]
  total: number
}

/** One page of favorited materials (backend caps pageSize; default 20). */
export async function getFavorites(
  params: { page?: number; pageSize?: number } = {},
): Promise<FavoritesPage> {
  const { data } = await apiClient.get<{
    items: FavoriteEntry[]
    page: number
    pageSize: number
    total: number
  }>('/favorites', { params })
  return {
    items: data.items.map((row) => row.material),
    page: data.page,
    pageSize: data.pageSize,
    total: data.total,
  }
}

/**
 * All favorited material ids + total count. Backs the star-toggle state and
 * the sidebar badge — the paginated list alone only ever covered one page, so
 * favorites beyond it rendered as unfavorited stars (and 409'd on click).
 */
export async function getFavoriteIds(): Promise<FavoriteIds> {
  const { data } = await apiClient.get<FavoriteIds>('/favorites/ids')
  return data
}

export async function addFavorite(materialId: string): Promise<void> {
  await apiClient.post(`/favorites/${materialId}`)
}

export async function removeFavorite(materialId: string): Promise<void> {
  await apiClient.delete(`/favorites/${materialId}`)
}
