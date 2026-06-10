import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
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

// Endpoints whose 401s must NOT trigger the global refresh or "clear auth +
// redirect to /login" flow. These run in the background (impression /
// view-event pings) where a stale access cookie is expected and silently
// dropping the ping is the correct UX.
export const SILENT_401_PATHS = ['/view-events']

// Endpoints whose 401s are handled by their own callers: AuthBootstrap's
// getMe().catch clears auth (a guest hitting /auth/me is the normal case, not
// a session expiry), and the login form surfaces the 401 as a form error. A
// guest's refresh would fail anyway, so skip refresh + redirect for these too —
// otherwise guests get an infinite full-page reload loop via /login.
export const SELF_HANDLED_401_PATHS = ['/auth/me', '/auth/login']

function matchesAnyPath(requestUrl: string | undefined, paths: string[]): boolean {
  if (!requestUrl) return false
  try {
    const parsed = new URL(requestUrl, apiClient.defaults.baseURL)
    return paths.some((path) => parsed.pathname === path || parsed.pathname.startsWith(`${path}/`))
  } catch {
    return paths.some((path) => requestUrl === path || requestUrl.startsWith(`${path}/`))
  }
}

export function shouldSilenceUnauthorized(requestUrl: string | undefined): boolean {
  return matchesAnyPath(requestUrl, SILENT_401_PATHS)
}

export function isSelfHandled401(requestUrl: string | undefined): boolean {
  return matchesAnyPath(requestUrl, SELF_HANDLED_401_PATHS)
}

export function isRefreshEndpoint(requestUrl: string | undefined): boolean {
  if (!requestUrl) return false
  try {
    const parsed = new URL(requestUrl, apiClient.defaults.baseURL)
    return parsed.pathname === '/auth/refresh'
  } catch {
    return requestUrl === '/auth/refresh'
  }
}

// ─── Token refresh single-flight ─────────────────────────────────────────────
// Shared across all concurrent 401s so we only call POST /auth/refresh once.
// Exported for testing purposes only (read-only snapshot — use attemptTokenRefresh).
export let refreshPromise: Promise<string | null> | null = null

export async function attemptTokenRefresh(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = apiClient
      .post<{ success: true; accessToken: string }>('/auth/refresh')
      .then((res) => {
        const newToken = res.data.accessToken ?? null
        if (newToken) {
          const currentUser = useAuthStore.getState().user
          if (currentUser) {
            useAuthStore.getState().setAuth(currentUser, newToken)
          }
        }
        return newToken
      })
      .catch((err: unknown) => {
        // Re-throw so callers know the refresh failed
        refreshPromise = null
        throw err
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

function redirectToLogin(): void {
  if (typeof window !== 'undefined') {
    useAuthStore.getState().clearAuth()
    const redirect = encodeURIComponent(`${window.location.pathname}${window.location.search ?? ''}`)
    window.location.href = `/login?redirect=${redirect}`
  }
}

// ─── Response: handle common error codes ─────────────────────────────────────
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status
    const config = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined

    if (status === 401) {
      const requestUrl = config?.url

      // Silent paths (e.g. /view-events): drop quietly, no refresh attempt
      if (shouldSilenceUnauthorized(requestUrl)) {
        return Promise.reject(error)
      }

      // /auth/me and /auth/login handle their own 401s — propagate to the
      // caller without refreshing or redirecting (see SELF_HANDLED_401_PATHS)
      if (isSelfHandled401(requestUrl)) {
        return Promise.reject(error)
      }

      // The refresh endpoint itself failed → hard logout (avoid infinite loop)
      if (isRefreshEndpoint(requestUrl)) {
        redirectToLogin()
        return Promise.reject(error)
      }

      // Already retried once → hard logout
      if (config?._retry) {
        redirectToLogin()
        return Promise.reject(error)
      }

      // First 401 on a non-silent, non-refresh request → attempt single-flight refresh
      try {
        await attemptTokenRefresh()
      } catch {
        redirectToLogin()
        return Promise.reject(error)
      }

      // Refresh succeeded — replay the original request once (mark _retry)
      if (config) {
        config._retry = true
        // Re-attach updated Bearer token for the retry
        const newToken = useAuthStore.getState().accessToken
        if (newToken && typeof config.headers?.set === 'function') {
          config.headers.set('Authorization', `Bearer ${newToken}`)
        }
        return apiClient.request(config)
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
