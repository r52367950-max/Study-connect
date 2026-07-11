import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api/client'

describe('api client csrf interceptor', () => {
  const originalAdapter = apiClient.defaults.adapter
  const originalDocument = globalThis.document
  // Must satisfy the client's 64-hex CSRF token shape check
  const TEST_CSRF = 'a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4'

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter
    vi.restoreAllMocks()
    Object.defineProperty(globalThis, 'document', {
      value: originalDocument,
      configurable: true,
      writable: true,
    })
  })

  it('adds x-csrf-token header for state-changing requests', async () => {
    Object.defineProperty(globalThis, 'document', {
      value: { cookie: `csrf-token=${TEST_CSRF}` },
      configurable: true,
      writable: true,
    })

    const adapter = vi.fn(async (config) => ({
      data: { ok: true },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }))
    apiClient.defaults.adapter = adapter

    await apiClient.post('/auth/logout')

    const requestConfig = adapter.mock.calls[0]?.[0]
    const csrfHeader =
      typeof requestConfig.headers?.get === 'function'
        ? requestConfig.headers.get('x-csrf-token')
        : requestConfig.headers?.['x-csrf-token']

    expect(csrfHeader).toBe(TEST_CSRF)
  })

  it('does not recurse csrf bootstrap when request url is absolute', async () => {
    Object.defineProperty(globalThis, 'document', {
      value: { cookie: '' },
      configurable: true,
      writable: true,
    })

    const adapter = vi.fn(async (config) => ({
      data: { csrfToken: 'bootstrapped-token' },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }))
    apiClient.defaults.adapter = adapter

    await apiClient.post('http://localhost:3000/auth/csrf')

    const requestConfig = adapter.mock.calls[0]?.[0]
    const csrfHeader =
      typeof requestConfig.headers?.get === 'function'
        ? requestConfig.headers.get('x-csrf-token')
        : requestConfig.headers?.['x-csrf-token']

    expect(csrfHeader).toBeUndefined()
  })
})
