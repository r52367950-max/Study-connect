import { create } from 'zustand'
import type { User } from '@/types'

export const AUTH_BROADCAST_CHANNEL = 'study-connect-auth'

export type AuthBroadcastEvent =
  | { type: 'logout' }
  | { type: 'token-refreshed'; accessToken: string }
  | { type: 'profile-updated'; user: User; accessToken?: string | null }

interface AuthState {
  user: User | null
  accessToken: string | null
  initialized: boolean
  setAuth: (user: User, accessToken?: string, options?: { broadcast?: boolean }) => void
  clearAuth: (options?: { broadcast?: boolean }) => void
  markInitialized: () => void
}

let authChannel: BroadcastChannel | null = null

function getAuthChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  if (!authChannel) {
    authChannel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL)
  }
  return authChannel
}

export function broadcastAuthEvent(event: AuthBroadcastEvent): void {
  getAuthChannel()?.postMessage(event)
}

export function closeAuthBroadcastChannelForTests(): void {
  authChannel?.close()
  authChannel = null
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  accessToken: null,
  initialized: false,
  setAuth: (user: User, accessToken?: string, options?: { broadcast?: boolean }) => {
    let nextToken: string | null = null
    set((state) => {
      nextToken = accessToken ?? (state.user?.id === user.id ? state.accessToken : null)
      return {
        user,
        // Access tokens intentionally stay in memory only. They are restored via
        // /auth/me + /auth/refresh during app bootstrap, never localStorage.
        accessToken: nextToken,
        initialized: true,
      }
    })
    if (options?.broadcast !== false) {
      broadcastAuthEvent({ type: 'profile-updated', user, accessToken: nextToken })
    }
  },
  clearAuth: (options?: { broadcast?: boolean }) => {
    set({ user: null, accessToken: null, initialized: true })
    if (options?.broadcast !== false) {
      broadcastAuthEvent({ type: 'logout' })
    }
  },
  markInitialized: () => {
    set({ initialized: true })
  },
}))

export function applyAuthBroadcastEvent(event: AuthBroadcastEvent): void {
  if (event.type === 'logout') {
    useAuthStore.getState().clearAuth({ broadcast: false })
    return
  }

  if (event.type === 'token-refreshed') {
    const current = useAuthStore.getState()
    if (current.user) {
      current.setAuth(current.user, event.accessToken, { broadcast: false })
    }
    return
  }

  useAuthStore.getState().setAuth(
    event.user,
    event.accessToken === null ? undefined : event.accessToken,
    { broadcast: false },
  )
}

export function initializeAuthBroadcastListener(): () => void {
  const channel = getAuthChannel()
  if (!channel) return () => undefined

  const handleMessage = (message: MessageEvent<AuthBroadcastEvent>) => {
    applyAuthBroadcastEvent(message.data)
  }

  channel.addEventListener('message', handleMessage)
  return () => channel.removeEventListener('message', handleMessage)
}
