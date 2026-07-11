import type { MaterialRowItem } from '@/types'
import { apiClient } from './client'

interface FavoriteEntry {
  id: string
  favoritedAt: string
  material: MaterialRowItem
}

// The star toggle on every <MaterialRow> derives its state from this full set,
// so fetch ALL pages — the backend defaults to pageSize=20, and a partial list
// renders items beyond it as un-starred (clicking one then 409s on re-add).
const FAVORITES_PAGE_SIZE = 50
const FAVORITES_MAX_PAGES = 20

export async function getFavorites(): Promise<MaterialRowItem[]> {
  const all: MaterialRowItem[] = []
  for (let page = 1; page <= FAVORITES_MAX_PAGES; page++) {
    const { data } = await apiClient.get<{ items: FavoriteEntry[]; total: number }>('/favorites', {
      params: { page, pageSize: FAVORITES_PAGE_SIZE },
    })
    all.push(...data.items.map((row) => row.material))
    if (all.length >= data.total || data.items.length === 0) break
  }
  return all
}

export async function addFavorite(materialId: string): Promise<void> {
  await apiClient.post(`/favorites/${materialId}`)
}

export async function removeFavorite(materialId: string): Promise<void> {
  await apiClient.delete(`/favorites/${materialId}`)
}
