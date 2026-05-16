import { create } from 'zustand'
import type { User } from '@/types'

interface AuthState {
  user: User | null
  accessToken: string | null
  initialized: boolean
  setAuth: (user: User, accessToken?: string) => void
  clearAuth: () => void
  markInitialized: () => void
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  accessToken: null,
  initialized: false,
  setAuth: (user: User, accessToken?: string) => {
    set({
      user,
      accessToken: accessToken ?? null,
      initialized: true,
    })
  },
  clearAuth: () => {
    set({ user: null, accessToken: null, initialized: true })
  },
  markInitialized: () => {
    set({ initialized: true })
  },
}))
