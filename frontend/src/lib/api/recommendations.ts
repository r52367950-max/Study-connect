import type { MaterialKind, MaterialRowItem } from '@/types'
import { apiClient } from './client'

interface RecommendItem {
  id: string
  title: string
  description?: string | null
  subject?: string | null
  stage?: string | null
  grade?: string | null
  kind?: MaterialKind | null
  year?: number | null
  region?: string | null
  downloadCount?: number
  avgScore?: number | null
}

export async function getRecommendedMaterials(limit = 20): Promise<MaterialRowItem[]> {
  const { data } = await apiClient.get<{ items: RecommendItem[] }>('/materials/recommend', {
    params: { limit },
  })
  return (data.items ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    subject: m.subject,
    stage: m.stage,
    grade: m.grade,
    kind: m.kind,
    year: m.year,
    region: m.region,
    avg_score: m.avgScore ?? null,
    download_count: m.downloadCount ?? 0,
  }))
}
