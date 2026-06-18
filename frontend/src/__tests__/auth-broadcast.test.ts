import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/types'
import { apiClient } from '@/lib/api/client'
import {
  AUTH_BROADCAST_CHANNEL,
  applyAuthBroadcastEvent,
  closeAuthBroadcastChannelForTests,
  initializeAuthBroadcastListener,
  useAuthStore,
} from '@/lib/auth-store'

const userA: User = { id: 'u1', email: 'u1@example.com', username: 'user1', role: 'USER' }
const userB: User = { id: 'u2', email: 'u2@example.com', username: 'user2', role: 'USER' }

function waitForMessage(channel: BroadcastChannel): Promise<unknown> {
  return new Promise((resolve) => {
    channel.addEventListener('message', (message) => resolve(message.data), { once: true })
  })
}

describe('auth BroadcastChannel multi-tab sync', () => {
  let originalAdapter: typeof apiClient.defaults.adapter

  beforeEach(() => {
    originalAdapter = apiClient.defaults.adapter
    useAuthStore.setState({ user: null, accessToken: null, initialized: false })
    closeAuthBroadcastChannelForTests()
  })

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter
    closeAuthBroadcastChannelForTests()
    useAuthStore.setState({ user: null, accessToken: null, initialized: false })
    vi.restoreAllMocks()
  })

  it('tab B clears auth when tab A broadcasts logout', async () => {
    const tabBChannel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL)
    const tabBMessage = waitForMessage(tabBChannel)

    useAuthStore.getState().setAuth(userA, 'tab-a-token', { broadcast: false })
    useAuthStore.getState().clearAuth()

    expect(await tabBMessage).toEqual({ type: 'logout' })

    useAuthStore.getState().setAuth(userB, 'tab-b-token', { broadcast: false })
    applyAuthBroadcastEvent({ type: 'logout' })

    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().accessToken).toBeNull()
    tabBChannel.close()
  })

  it('tab B accepts tab A refresh success without starting another refresh', async () => {
    let refreshCalls = 0
    apiClient.defaults.adapter = vi.fn(async (config) => {
      if (config.url === '/auth/refresh') refreshCalls++
      return { data: { success: true, accessToken: 'unexpected' }, status: 200, statusText: 'OK', headers: {}, config }
    })

    useAuthStore.getState().setAuth(userB, 'old-tab-b-token', { broadcast: false })
    applyAuthBroadcastEvent({ type: 'token-refreshed', accessToken: 'fresh-from-tab-a' })

    await Promise.resolve()

    expect(useAuthStore.getState().user).toEqual(userB)
    expect(useAuthStore.getState().accessToken).toBe('fresh-from-tab-a')
    expect(refreshCalls).toBe(0)
  })

  it('initializes a BroadcastChannel listener for auth events', async () => {
    const unsubscribe = initializeAuthBroadcastListener()
    const tabAChannel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL)

    useAuthStore.getState().setAuth(userA, 'token', { broadcast: false })
    tabAChannel.postMessage({ type: 'profile-updated', user: userB, accessToken: 'profile-token' })

    await vi.waitFor(() => {
      expect(useAuthStore.getState().user).toEqual(userB)
      expect(useAuthStore.getState().accessToken).toBe('profile-token')
    })

    unsubscribe()
    tabAChannel.close()
  })
})
