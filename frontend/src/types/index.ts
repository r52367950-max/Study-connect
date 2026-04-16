// ─── User ────────────────────────────────────────────────────────────────────

export type UserRole = 'USER' | 'ADMIN'

export interface User {
  id: string
  email: string
  username: string
  role: UserRole
  avatarUrl?: string | null
  createdAt?: string
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthResponse {
  accessToken: string
  user: User
}

// ─── Material ────────────────────────────────────────────────────────────────

export type MaterialStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'OFFLINE'
export type MaterialVisibility = 'PUBLIC' | 'PRIVATE'
export type MaterialSort = 'latest' | 'relevance' | 'downloads' | 'rating'

export interface Material {
  id: string
  title: string
  description?: string | null
  stage?: string | null
  grade?: string | null
  subject?: string | null
  year?: number | null
  region?: string | null
  fileKey?: string
  visibility: MaterialVisibility
  status: MaterialStatus
  reviewComment?: string | null
  uploaderId: string
  uploader?: Pick<User, 'id' | 'username'>
  createdAt: string
  updatedAt: string
  // Aggregated fields from list/detail endpoints
  avg_score?: number | null
  download_count?: number
  rating_count?: number
}

export interface MaterialListItem
  extends Pick<
    Material,
    | 'id'
    | 'title'
    | 'description'
    | 'stage'
    | 'grade'
    | 'subject'
    | 'year'
    | 'region'
    | 'visibility'
    | 'createdAt'
    | 'avg_score'
    | 'download_count'
    | 'uploader'
  > {}

// ─── Rating ──────────────────────────────────────────────────────────────────

export interface Rating {
  id: string
  user_id: string
  material_id: string
  score: number
  content?: string | null
  created_at: string
  updated_at: string
  user?: Pick<User, 'id' | 'username'>
}

// ─── API Responses ───────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface MaterialSearchParams {
  q?: string
  stage?: string
  grade?: string
  subject?: string
  year?: number
  region?: string
  sort?: MaterialSort
  page?: number
  pageSize?: number
}

export interface UploadMaterialPayload {
  title: string
  description?: string
  stage?: string
  grade?: string
  subject?: string
  year?: number
  region?: string
  visibility?: MaterialVisibility
  file: File
}

export interface CreateRatingPayload {
  score: number
  content?: string
}

export interface AdminPendingItem {
  id: string
  title: string
  subject?: string | null
  stage?: string | null
  grade?: string | null
  status: MaterialStatus
  createdAt: string
  uploader?: Pick<User, 'id' | 'username'>
}
