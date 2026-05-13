import type { SchoolSummary } from '@/types'
import { apiClient } from './client'

export interface SearchSchoolsParams {
  city?: string
  q?: string
  limit?: number
}

export async function searchSchools(params: SearchSchoolsParams): Promise<SchoolSummary[]> {
  const { data } = await apiClient.get<{ items: SchoolSummary[] }>('/schools', { params })
  return data.items
}
