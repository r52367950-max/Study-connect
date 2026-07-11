import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InternalAxiosRequestConfig } from 'axios'
import { apiClient, isSelfHandled401 } from '@/lib/api/client'
import { useAuthStore } from '@/lib/auth-store'

describe('isSelfHandled401()', () => {
  it('returns true for /auth/me', () => {
    expect(isSelfHandled401('/auth/me')).toBe(true)
  })

  it('returns true for /auth/login', () => {
    expect(isSelfHandled401('/auth/login')).toBe(true)
  })

  it('returns false for /materials', () => {
    expect(isSelfHandled401('/materials')).toBe(false)
  })

  it('returns false for /auth/refresh', () => {
    expect(isSelfHandled401('/auth/refresh')).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isSelfHandled401(undefined)).toBe(false)
  })
})

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
      value: { cookie: 'csrf-token=a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4' },
    })

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        pathname: '/profile',
        search: '?tab=uploads',
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

  function alwaysUnauthorizedAdapter() {
    return vi.fn(async (config: InternalAxiosRequestConfig) => {
      const err = Object.assign(new Error('Unauthorized'), {
        isAxiosError: true,
        config,
        response: { status: 401, data: {}, headers: {} },
        name: 'AxiosError',
      })
      throw err
    })
  }

  it('/auth/me 401 propagates to the caller — no refresh attempt, no redirect', async () => {
    // Guests hit /auth/me 401 on every page load (AuthBootstrap); the
    // interceptor must NOT refresh or bounce them to /login, otherwise public
    // pages enter an infinite full-page reload loop.
    const adapter = alwaysUnauthorizedAdapter()
    apiClient.defaults.adapter = adapter

    await expect(apiClient.get('/auth/me')).rejects.toBeDefined()

    expect(capturedHref).toBe('')
    // Exactly one request: no /auth/refresh follow-up was issued
    expect(adapter).toHaveBeenCalledTimes(1)
    // Auth state is left to AuthBootstrap's catch — the interceptor doesn't touch it
    expect(useAuthStore.getState().user).not.toBeNull()
  }, 8000)

  it('/auth/login 401 propagates to the form — no refresh attempt, no redirect', async () => {
    const adapter = alwaysUnauthorizedAdapter()
    apiClient.defaults.adapter = adapter

    await expect(apiClient.post('/auth/login', { email: 'u@e.com', password: 'wrong-pass' })).rejects.toBeDefined()

    expect(capturedHref).toBe('')
    expect(adapter).toHaveBeenCalledTimes(1)
  }, 8000)

  it('clears auth state and redirects to login (path + query) on a protected resource 401 when refresh also fails', async () => {
    // Both /favorites and the subsequent /auth/refresh return 401
    // → refresh fails → clearAuth + redirect to /login
    apiClient.defaults.adapter = alwaysUnauthorizedAdapter()

    await expect(apiClient.get('/favorites')).rejects.toBeDefined()

    expect(useAuthStore.getState().user).toBeNull()
    expect(capturedHref).toBe('/login?redirect=%2Fprofile%3Ftab%3Duploads')
  }, 8000)
})
