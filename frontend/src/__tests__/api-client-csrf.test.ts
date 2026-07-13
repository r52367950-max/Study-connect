import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api/client'

describe('api client csrf interceptor', () => {
  const originalAdapter = apiClient.defaults.adapter
  const originalDocument = globalThis.document

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
      value: { cookie: 'csrf-token=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' },
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

    expect(csrfHeader).toBe('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')
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
