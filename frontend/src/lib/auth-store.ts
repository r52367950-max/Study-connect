import { create } from 'zustand'
import type { User } from '@/types'

interface AuthState {
  user: User | null
  initialized: boolean
  setAuth: (user: User) => void
  clearAuth: () => void
  markInitialized: () => void
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  initialized: false,
  setAuth: (user: User) => {
    set({ user, initialized: true })
  },
  clearAuth: () => {
    set({ user: null, initialized: true })
  },
  markInitialized: () => {
    set({ initialized: true })
  },
}))
