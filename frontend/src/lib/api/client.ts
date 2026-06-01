import axios, { AxiosError } from 'axios'
import { useAuthStore } from '@/lib/auth-store'

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  timeout: 20000,
  withCredentials: true,
})

const CSRF_COOKIE_NAME = 'csrf-token'
export const CSRF_HEADER_NAME = 'x-csrf-token'
const STATE_CHANGING_METHODS = new Set(['post', 'put', 'patch', 'delete'])
let csrfBootstrapPromise: Promise<string> | null = null

function isCsrfBootstrapRequest(requestUrl: string): boolean {
  if (!requestUrl) return false
  if (requestUrl === '/auth/csrf') return true

  try {
    const parsedUrl = new URL(requestUrl, apiClient.defaults.baseURL)
    return parsedUrl.pathname === '/auth/csrf'
  } catch {
    return false
  }
}

export function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null
  const cookies = document.cookie ? document.cookie.split(';') : []
  for (const item of cookies) {
    const [rawName, ...rawValue] = item.trim().split('=')
    if (rawName === CSRF_COOKIE_NAME && rawValue.length > 0) {
      return decodeURIComponent(rawValue.join('='))
    }
  }
  return null
}

export async function ensureCsrfToken(): Promise<string> {
  const cookieToken = getCsrfTokenFromCookie()
  if (cookieToken) {
    return cookieToken
  }

  if (!csrfBootstrapPromise) {
    csrfBootstrapPromise = apiClient
      .get<{ csrfToken: string }>('/auth/csrf')
      .then((response) => response.data.csrfToken)
      .finally(() => {
        csrfBootstrapPromise = null
      })
  }

  return csrfBootstrapPromise
}

apiClient.interceptors.request.use(async (config) => {
  const method = (config.method ?? 'get').toLowerCase()
  const requestUrl = config.url ?? ''
  const accessToken = useAuthStore.getState().accessToken

  if (accessToken) {
    config.headers.set('Authorization', `Bearer ${accessToken}`)
  }

  if (!STATE_CHANGING_METHODS.has(method) || isCsrfBootstrapRequest(requestUrl)) {
    return config
  }

  const token = await ensureCsrfToken()
  config.headers.set(CSRF_HEADER_NAME, token)
  return config
})

// ─── 403 handler (exported for unit testing) ─────────────────────────────────
/**
 * Handles a 403 response based on which endpoint was called.
 * - /admin/* → redirect to /?forbidden=1 (admin guard feedback)
 * - others   → no redirect; error propagates to the calling component
 */
export function handle403(requestUrl: string): void {
  if (typeof window === 'undefined') return
  if (requestUrl.startsWith('/admin')) {
    window.location.href = '/?forbidden=1'
  }
  // Non-admin 403: let getErrorMessage('无访问权限') surface in the component
}

// Endpoints whose 401s must NOT trigger the global "clear auth + redirect to
// /login" flow. These run in the background (impression / view-event pings)
// where a stale access cookie is expected and silently dropping the ping is
// the correct UX — otherwise scrolling a list after the 15-min access cookie
// expires would "ghost-logout" the user mid-browse.
const SILENT_401_PATHS = ['/view-events']

function shouldSilenceUnauthorized(requestUrl: string | undefined): boolean {
  if (!requestUrl) return false
  try {
    const parsed = new URL(requestUrl, apiClient.defaults.baseURL)
    return SILENT_401_PATHS.some((path) => parsed.pathname === path || parsed.pathname.startsWith(`${path}/`))
  } catch {
    return SILENT_401_PATHS.some((path) => requestUrl === path || requestUrl.startsWith(`${path}/`))
  }
}

// ─── Response: handle common error codes ─────────────────────────────────────
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response?.status

    if (status === 401 && !shouldSilenceUnauthorized(error.config?.url)) {
      // Clear in-memory auth state and redirect to login
      if (typeof window !== 'undefined') {
        useAuthStore.getState().clearAuth()
        const redirect = encodeURIComponent(window.location.pathname)
        window.location.href = `/login?redirect=${redirect}`
      }
    }

    if (status === 403) {
      handle403(error.config?.url ?? '')
    }

    return Promise.reject(error)
  },
)

// ─── Error message helper ─────────────────────────────────────────────────────
export function getErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data as
      | { message?: string | string[]; error?: string }
      | undefined

    if (data?.message) {
      if (Array.isArray(data.message)) return data.message.join('；')
      if (typeof data.message === 'string') return data.message
    }

    switch (error.response?.status) {
      case 400:
        return '请求参数有误'
      case 401:
        return '请先登录'
      case 403:
        return '无访问权限'
      case 404:
        return '内容不存在'
      case 409:
        return '内容已存在'
      case 422:
        return '输入数据有误，请检查后重试'
      case 500:
        return '服务器错误，请稍后重试'
      default:
        return `请求失败 (${error.response?.status ?? '网络错误'})`
    }
  }
  if (error instanceof Error) return error.message
  return '操作失败，请稍后重试'
}
