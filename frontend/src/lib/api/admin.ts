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

export interface AdminReportItem {
  id: string
  materialId: string
  reason: string
  description?: string | null
  evidence?: string | null
  status: 'OPEN' | 'REVIEWING' | 'RESOLVED' | 'REJECTED'
  adminReason?: string | null
  createdAt: string
  reviewedAt?: string | null
  material: Pick<Material, 'id' | 'title' | 'status'>
  reporter: { username: string }
  reviewer?: { username: string } | null
}

export interface AdminReportListResponse {
  items: AdminReportItem[]
  total: number
  page: number
  pageSize: number
}

export async function getMaterialReports(
  params: { page?: number; pageSize?: number } = {},
): Promise<AdminReportListResponse> {
  const { data } = await apiClient.get<AdminReportListResponse>('/admin/reports', { params })
  return data
}

export async function processMaterialReport(
  id: string,
  payload: { status: AdminReportItem['status']; reason: string; offlineMaterial?: boolean; restoreMaterial?: boolean },
): Promise<AdminReportItem> {
  const { data } = await apiClient.post<AdminReportItem>(`/admin/reports/${id}/process`, payload)
  return data
}

export async function restoreMaterial(
  id: string,
  reviewComment: string,
): Promise<Pick<Material, 'id' | 'status'>> {
  const { data } = await apiClient.post(`/admin/materials/${id}/restore`, { reviewComment })
  return data
}
