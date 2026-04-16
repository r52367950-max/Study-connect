import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxiosError } from 'axios'
import { apiClient } from '@/lib/api/client'
import { useAuthStore } from '@/lib/auth-store'

describe('api client 401 handling', () => {
  let capturedHref = ''

  beforeEach(() => {
    useAuthStore.setState({ user: { id: 'u1', email: 'u@e.com', username: 'u', role: 'USER' }, initialized: true })
    capturedHref = ''
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

  it('clears auth state and redirects to login when response is 401', async () => {
    const adapter = vi.fn(async () => {
      const err = {
        isAxiosError: true,
        config: { url: '/auth/me' },
        response: { status: 401, data: {} },
      } as AxiosError
      throw err
    })

    const originalAdapter = apiClient.defaults.adapter
    apiClient.defaults.adapter = adapter

    await expect(apiClient.get('/auth/me')).rejects.toBeDefined()

    expect(useAuthStore.getState().user).toBeNull()
    expect(capturedHref).toBe('/login?redirect=%2Fprofile')

    apiClient.defaults.adapter = originalAdapter
  })
})
