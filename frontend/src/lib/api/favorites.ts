import type { MaterialRowItem } from '@/types'
import { apiClient } from './client'

interface FavoriteEntry {
  id: string
  favoritedAt: string
  material: MaterialRowItem
}

export async function getFavorites(): Promise<MaterialRowItem[]> {
  const { data } = await apiClient.get<{ items: FavoriteEntry[] }>('/favorites')
  return data.items.map((row) => row.material)
}

export async function addFavorite(materialId: string): Promise<void> {
  await apiClient.post(`/favorites/${materialId}`)
}

export async function removeFavorite(materialId: string): Promise<void> {
  await apiClient.delete(`/favorites/${materialId}`)
}
