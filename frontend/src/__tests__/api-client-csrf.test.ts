import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api/client'

// The client only trusts a csrf cookie matching /^[a-f0-9]{64}$/i (it rejects a
// malformed token rather than echoing it back). Fixtures must therefore use a
// well-formed token, otherwise the request interceptor falls through to
// bootstrapping GET /auth/csrf, which is exactly what these tests avoid.
const VALID_CSRF_TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'


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
      value: { cookie: `csrf-token=${VALID_CSRF_TOKEN}` },
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

    expect(csrfHeader).toBe(VALID_CSRF_TOKEN)
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

  it('a 401 from the csrf bootstrap rejects instead of deadlocking', async () => {
    // Regression: a state-changing request blocks on ensureCsrfToken(). When the
    // bootstrap GET /auth/csrf returned 401 and was routed through the refresh
    // path, it awaited the refresh promise that was itself waiting on this
    // bootstrap — nothing ever settled and every write hung until the axios
    // timeout. /auth/csrf is self-handled now, so the 401 propagates.
    Object.defineProperty(globalThis, 'document', {
      value: { cookie: '' },
      configurable: true,
      writable: true,
    })

    let refreshCalls = 0
    apiClient.defaults.adapter = vi.fn(async (config) => {
      if ((config.url ?? '').includes('/auth/refresh')) refreshCalls++
      throw Object.assign(new Error('Unauthorized'), {
        isAxiosError: true,
        config,
        response: { status: 401, data: {}, headers: {} },
        name: 'AxiosError',
      })
    })

    const outcome = await Promise.race([
      apiClient.post('/materials/1/ratings', { score: 5 }).then(
        () => 'resolved',
        () => 'rejected',
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve('hung'), 2000)),
    ])

    expect(outcome).toBe('rejected')
    expect(refreshCalls).toBe(0)
  }, 5000)
})
