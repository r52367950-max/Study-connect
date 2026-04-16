import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/types'
import { login, getMe } from '@/lib/api/auth'
import { apiClient } from '@/lib/api/client'
import { useAuthStore } from '@/lib/auth-store'

const mockUser: User = {
  id: 'user-1',
  email: 'test@example.com',
  username: 'tester',
  role: 'USER',
}

describe('auth flow regression', () => {
  const originalAdapter = apiClient.defaults.adapter

  beforeEach(() => {
    useAuthStore.setState({ user: null })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    apiClient.defaults.adapter = originalAdapter
  })

  it('stores user state after login success without persisting token', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: {
        user: mockUser,
      },
    } as never)

    const data = await login({ email: mockUser.email, password: 'password123' })
    useAuthStore.getState().setAuth(data.user)

    expect(useAuthStore.getState().user).toEqual(mockUser)
  })

  it('uses credentialed request for /auth/me without Authorization header', async () => {
    useAuthStore.getState().setAuth(mockUser)

    const adapter = vi.fn(async (config) => ({
      data: mockUser,
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }))
    apiClient.defaults.adapter = adapter

    await getMe()

    const requestConfig = adapter.mock.calls[0]?.[0]
    const authHeader =
      typeof requestConfig.headers?.get === 'function'
        ? requestConfig.headers.get('Authorization')
        : requestConfig.headers?.Authorization

    expect(requestConfig.url).toBe('/auth/me')
    expect(requestConfig.withCredentials).toBe(true)
    expect(authHeader).toBeUndefined()
  })
})
