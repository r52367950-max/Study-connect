import type { AdminPendingItem, Material } from '@/types'
import { apiClient } from './client'

export interface PendingListResponse {
  items: AdminPendingItem[]
  total: number
  page: number
  pageSize: number
}

export async function getPendingMaterials(
  params: { page?: number; pageSize?: number } = {},
): Promise<PendingListResponse> {
  const { data } = await apiClient.get<PendingListResponse>('/admin/materials/pending', {
    params,
  })
  return data
}

export async function approveMaterial(id: string): Promise<Pick<Material, 'id' | 'status'>> {
  const { data } = await apiClient.post(`/admin/materials/${id}/approve`)
  return data
}

export async function rejectMaterial(
  id: string,
  reason: string,
): Promise<Pick<Material, 'id' | 'status'>> {
  const { data } = await apiClient.post(`/admin/materials/${id}/reject`, { reason })
  return data
}

export async function offlineMaterial(
  id: string,
  reviewComment?: string,
): Promise<Pick<Material, 'id' | 'status'>> {
  const { data } = await apiClient.post(`/admin/materials/${id}/offline`, { reviewComment })
  return data
}
