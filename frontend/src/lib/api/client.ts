import axios, { AxiosError } from 'axios'
import { getToken } from '@/lib/auth-store'

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  timeout: 20000,
})

// ─── Request: attach Bearer token ────────────────────────────────────────────
apiClient.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ─── Response: handle common error codes ─────────────────────────────────────
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Clear persisted auth and redirect to login
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth-storage')
        document.cookie = 'auth-token=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/'
        const redirect = encodeURIComponent(window.location.pathname)
        window.location.href = `/login?redirect=${redirect}`
      }
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
