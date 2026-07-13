/**
 * api-client-refresh.test.ts
 *
 * Tests for the token-refresh single-flight interceptor in api/client.ts.
 *
 * Covers:
 *   1. shouldSilenceUnauthorized – /view-events is silent
 *   2. isRefreshEndpoint – /auth/refresh is correctly detected
 *   3. 401 on a normal endpoint → refresh succeeds → original request replayed
 *   4. Concurrent 401s only trigger ONE refresh call (single-flight)
 *   5. 401 on /auth/refresh itself → clearAuth + redirect (no loop)
 *   6. /view-events 401 → silent drop, no refresh, no redirect
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InternalAxiosRequestConfig } from 'axios'
import { apiClient, shouldSilenceUnauthorized, isRefreshEndpoint, attemptTokenRefresh } from '@/lib/api/client'
import { useAuthStore } from '@/lib/auth-store'

// Build a minimal error object that the response interceptor handles.
// We pass in the REAL config so _retry can be set on it by the interceptor.
function makeAxiosError(config: InternalAxiosRequestConfig, status = 401) {
  return Object.assign(new Error('Unauthorized'), {
    isAxiosError: true,
    config,
    response: { status, data: {}, headers: {} },
    name: 'AxiosError',
  })
}

// ─── Unit tests for helper predicates ────────────────────────────────────────

describe('shouldSilenceUnauthorized()', () => {
  it('returns true for /view-events', () => {
    expect(shouldSilenceUnauthorized('/view-events')).toBe(true)
  })

  it('returns true for /view-events sub-paths', () => {
    expect(shouldSilenceUnauthorized('/view-events/123')).toBe(true)
  })

  it('returns false for /materials', () => {
    expect(shouldSilenceUnauthorized('/materials')).toBe(false)
  })

  it('returns false for /auth/me', () => {
    expect(shouldSilenceUnauthorized('/auth/me')).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(shouldSilenceUnauthorized(undefined)).toBe(false)
  })
})

describe('isRefreshEndpoint()', () => {
  it('returns true for /auth/refresh', () => {
    expect(isRefreshEndpoint('/auth/refresh')).toBe(true)
  })

  it('returns false for /auth/login', () => {
    expect(isRefreshEndpoint('/auth/login')).toBe(false)
  })

  it('returns false for /materials', () => {
    expect(isRefreshEndpoint('/materials')).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isRefreshEndpoint(undefined)).toBe(false)
  })
})

// ─── Integration tests using mock adapter ────────────────────────────────────

describe('api client token refresh interceptor', () => {
  let capturedHref = ''
  let originalLocation: Location
  let originalAdapter: typeof apiClient.defaults.adapter
  let originalDocument: Document

  beforeEach(() => {
    originalAdapter = apiClient.defaults.adapter
    originalLocation = window.location
    originalDocument = globalThis.document
    capturedHref = ''

    // Provide a CSRF token so the request interceptor doesn't bootstrap /auth/csrf
    // (which would muddy the adapter call log with extra requests).
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      writable: true,
      value: { cookie: 'csrf-token=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' },
    })

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        pathname: '/materials',
        get href() { return capturedHref },
        set href(v: string) { capturedHref = v },
      },
    })
    useAuthStore.setState({
      user: { id: 'u1', email: 'u@e.com', username: 'user1', role: 'USER' },
      accessToken: 'old-token',
      initialized: true,
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

  it('401 on normal endpoint → refresh succeeds → replays original request', async () => {
    const firstPassDone = new Set<string>()

    apiClient.defaults.adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      const url = config.url ?? ''

      if (url === '/auth/refresh') {
        return { data: { success: true, accessToken: 'new-token' }, status: 200, statusText: 'OK', headers: {}, config }
      }

      if (!firstPassDone.has(url)) {
        firstPassDone.add(url)
        throw makeAxiosError(config, 401)
      }

      return { data: { id: '1', title: 'Test' }, status: 200, statusText: 'OK', headers: {}, config }
    })

    const res = await apiClient.get('/materials/1')
    expect(res.data).toEqual({ id: '1', title: 'Test' })
    expect(useAuthStore.getState().accessToken).toBe('new-token')
    expect(capturedHref).toBe('')
  }, 8000)

  it('concurrent 401s only trigger ONE /auth/refresh call (single-flight)', async () => {
    let refreshCallCount = 0
    const firstPassDone = new Set<string>()

    apiClient.defaults.adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      const url = config.url ?? ''

      if (url === '/auth/refresh') {
        refreshCallCount++
        await new Promise<void>((r) => setTimeout(r, 5))
        return { data: { success: true, accessToken: 'new-token-sf' }, status: 200, statusText: 'OK', headers: {}, config }
      }

      if (!firstPassDone.has(url)) {
        firstPassDone.add(url)
        throw makeAxiosError(config, 401)
      }

      return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config }
    })

    const results = await Promise.all([
      apiClient.get('/materials/a'),
      apiClient.get('/materials/b'),
      apiClient.get('/materials/c'),
    ])

    expect(results.map((r) => r.data)).toEqual([{ ok: true }, { ok: true }, { ok: true }])
    expect(refreshCallCount).toBe(1)
  }, 15000)

  it('401 on /auth/refresh itself → clearAuth + redirect to /login, no loop', async () => {
    let refreshCallCount = 0

    apiClient.defaults.adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      const url = config.url ?? ''
      if (url === '/auth/refresh') {
        refreshCallCount++
      }
      throw makeAxiosError(config, 401)
    })

    await expect(apiClient.get('/profile')).rejects.toBeDefined()

    expect(useAuthStore.getState().user).toBeNull()
    expect(capturedHref).toMatch('/login?redirect=')
    expect(refreshCallCount).toBe(1)
  }, 8000)

  it('/view-events 401 is silent — no refresh call, no redirect', async () => {
    let refreshCallCount = 0

    apiClient.defaults.adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      const url = config.url ?? ''
      if (url === '/auth/refresh') {
        refreshCallCount++
        return { data: { success: true, accessToken: 'tok' }, status: 200, statusText: 'OK', headers: {}, config }
      }
      throw makeAxiosError(config, 401)
    })

    await expect(apiClient.post('/view-events', {})).rejects.toBeDefined()

    expect(capturedHref).toBe('')
    expect(useAuthStore.getState().user).not.toBeNull()
    expect(refreshCallCount).toBe(0)
  }, 8000)
})

describe('attemptTokenRefresh export', () => {
  it('is exported as a function from client module', () => {
    expect(typeof attemptTokenRefresh).toBe('function')
  })
})
