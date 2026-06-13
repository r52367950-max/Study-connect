import type {
  Material,
  MaterialListItem,
  MaterialSearchParams,
  PaginatedResponse,
  Rating,
  CreateRatingPayload,
  UploadMaterialPayload,
} from '@/types'
import { apiClient } from './client'

// ─── List ─────────────────────────────────────────────────────────────────────

export async function getMaterials(
  params: MaterialSearchParams = {},
): Promise<PaginatedResponse<MaterialListItem>> {
  const { data } = await apiClient.get<PaginatedResponse<MaterialListItem>>('/materials', {
    params,
  })
  return data
}

// ─── Detail ───────────────────────────────────────────────────────────────────

export async function getMaterial(id: string): Promise<Material> {
  const { data } = await apiClient.get<Material>(`/materials/${id}`)
  return data
}

// ─── Upload ───────────────────────────────────────────────────────────────────

export async function uploadMaterial(
  payload: UploadMaterialPayload,
  onUploadProgress?: (percent: number) => void,
): Promise<Material> {
  const form = new FormData()
  form.append('title', payload.title)
  if (payload.description) form.append('description', payload.description)
  if (payload.stage) form.append('stage', payload.stage)
  if (payload.grade) form.append('grade', payload.grade)
  if (payload.subject) form.append('subject', payload.subject)
  if (payload.year != null) form.append('year', String(payload.year))
  if (payload.region) form.append('region', payload.region)
  if (payload.visibility) form.append('visibility', payload.visibility)
  form.append('file', payload.file)

  const { data } = await apiClient.post<Material>('/materials', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    ...(onUploadProgress && {
      onUploadProgress: (event) => {
        if (event.total) {
          onUploadProgress(Math.round((event.loaded / event.total) * 100))
        }
      },
    }),
  })
  return data
}

// ─── Download ─────────────────────────────────────────────────────────────────

export async function downloadMaterial(id: string): Promise<{ downloadUrl: string }> {
  const { data } = await apiClient.get<{ downloadUrl: string }>(`/materials/${id}/download`)
  return data
}

// ─── Ratings ──────────────────────────────────────────────────────────────────

export interface RatingsResponse {
  items: Rating[]
  total: number
  avg_score: number | null
  rating_count: number
}

export async function getRatings(
  materialId: string,
  params: { page?: number; pageSize?: number } = {},
): Promise<RatingsResponse> {
  const { data } = await apiClient.get<RatingsResponse>(`/materials/${materialId}/ratings`, {
    params,
  })
  return data
}

export async function submitRating(
  materialId: string,
  payload: CreateRatingPayload,
): Promise<Rating> {
  const ratingPayload: CreateRatingPayload = {
    score: payload.score,
    content: payload.content,
  }
  const { data } = await apiClient.post<Rating>(`/materials/${materialId}/ratings`, ratingPayload)
  return data
}

export interface ReportMaterialPayload {
  reason: string
  description?: string
  evidence?: string
}

export async function reportMaterial(
  materialId: string,
  payload: ReportMaterialPayload,
): Promise<{ id: string; status: string }> {
  const { data } = await apiClient.post<{ id: string; status: string }>(
    `/materials/${materialId}/reports`,
    payload,
  )
  return data
}

export async function appealMaterial(
  materialId: string,
  payload: { reason: string; evidence?: string },
): Promise<{ id: string; status: string }> {
  const { data } = await apiClient.post<{ id: string; status: string }>(
    `/materials/${materialId}/appeals`,
    payload,
  )
  return data
}

export async function submitMaterialVersion(
  materialId: string,
  payload: { fileKey: string; changelog?: string },
): Promise<{ id: string; status: string }> {
  const { data } = await apiClient.post<{ id: string; status: string }>(
    `/materials/${materialId}/versions`,
    payload,
  )
  return data
}
