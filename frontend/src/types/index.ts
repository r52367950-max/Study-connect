// ─── User ────────────────────────────────────────────────────────────────────

export type UserRole = 'USER' | 'ADMIN'

export interface User {
  id: string
  email?: string | null
  phone?: string | null
  username: string
  role: UserRole
  avatarUrl?: string | null
  createdAt?: string
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthResponse {
  user: User
  accessToken: string
}

export type OtpChannel = 'sms' | 'email'
export type OtpPurpose = 'REGISTER' | 'LOGIN' | 'RESET'

// ─── Onboarding profile ──────────────────────────────────────────────────────

export type ProfileRole = 'TEACHER' | 'STUDENT'

export interface SchoolSummary {
  id: string
  name: string
  city: string
}

export interface Profile {
  id: string
  email: string | null
  phone: string | null
  username: string
  profileRole: ProfileRole | null
  displayName: string | null
  school: SchoolSummary | null
  schoolNameFreeText: string | null
  city: string | null
  stages: string[]
  grades: string[]
  subjects: string[]
  viewedKinds: string[]
  collaborativeOptIn: boolean
  onboardedAt: string | null
  gradesUpdatedAt: string | null
}

export interface UpdateProfilePayload {
  profileRole?: ProfileRole
  displayName?: string
  schoolId?: string | null
  schoolNameFreeText?: string | null
  city?: string
  stages?: string[]
  grades?: string[]
  subjects?: string[]
  viewedKinds?: string[]
  collaborativeOptIn?: boolean
}

// ─── Material ────────────────────────────────────────────────────────────────

export type MaterialStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'OFFLINE'
export type MaterialVisibility = 'PUBLIC' | 'PRIVATE'
export type MaterialSort = 'latest' | 'relevance' | 'downloads' | 'rating'
export type MaterialKind = 'EXERCISE' | 'HANDOUT' | 'EXAM' | 'MOCK'

export interface Material {
  id: string
  title: string
  description?: string | null
  stage?: string | null
  grade?: string | null
  subject?: string | null
  kind?: MaterialKind | null
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
    | 'kind'
    | 'year'
    | 'region'
    | 'visibility'
    | 'createdAt'
    | 'avg_score'
    | 'download_count'
    | 'uploader'
  > {}

// Minimal shape consumed by the DirB list-row view (<MaterialRow>). It is the
// common denominator of /materials list items, /favorites entries and
// /materials/recommend results, which expose slightly different fields.
export interface MaterialRowItem {
  id: string
  title: string
  description?: string | null
  stage?: string | null
  grade?: string | null
  subject?: string | null
  kind?: MaterialKind | null
  year?: number | null
  region?: string | null
  avg_score?: number | null
  download_count?: number
  // Human-readable recommendation rationale (only present on /materials/recommend results).
  reason?: string | null
}

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
  subject: string | null
  stage: string | null
  grade: string | null
  createdAt: string
  uploader: Pick<User, 'username'>
}
