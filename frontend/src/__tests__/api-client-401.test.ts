import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InternalAxiosRequestConfig } from 'axios'
import { apiClient } from '@/lib/api/client'
import { useAuthStore } from '@/lib/auth-store'

describe('api client 401 handling', () => {
  let capturedHref = ''
  let originalLocation: Location
  let originalAdapter: typeof apiClient.defaults.adapter
  let originalDocument: Document

  beforeEach(() => {
    originalAdapter = apiClient.defaults.adapter
    originalLocation = window.location
    originalDocument = globalThis.document
    useAuthStore.setState({ user: { id: 'u1', email: 'u@e.com', username: 'u', role: 'USER' }, initialized: true, accessToken: null })
    capturedHref = ''

    // Provide a CSRF token so the request interceptor skips the /auth/csrf bootstrap
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      writable: true,
      value: { cookie: 'csrf-token=test-csrf' },
    })

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        pathname: '/profile',
        get href() {
          return capturedHref
        },
        set href(v: string) {
          capturedHref = v
        },
      },
    })
  })

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      writable: true,
      value: originalDocument,
    })
    useAuthStore.setState({ user: null, accessToken: null, initialized: false })
    vi.restoreAllMocks()
  })

  it('clears auth state and redirects to login when response is 401 (refresh also fails)', async () => {
    // Both /auth/me and the subsequent /auth/refresh return 401
    // → refresh fails → clearAuth + redirect to /login
    apiClient.defaults.adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      const err = Object.assign(new Error('Unauthorized'), {
        isAxiosError: true,
        config,
        response: { status: 401, data: {}, headers: {} },
        name: 'AxiosError',
      })
      throw err
    })

    await expect(apiClient.get('/auth/me')).rejects.toBeDefined()

    expect(useAuthStore.getState().user).toBeNull()
    expect(capturedHref).toBe('/login?redirect=%2Fprofile')
  }, 8000)
})
