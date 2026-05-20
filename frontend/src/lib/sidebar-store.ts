import { create } from 'zustand'

interface SidebarState {
  mobileOpen: boolean
  setMobileOpen: (open: boolean) => void
}

// Controls the <lg drawer (mobile sidebar). Topbar's hamburger opens it; the
// Sheet and in-drawer navigation close it.
export const useSidebarStore = create<SidebarState>((set) => ({
  mobileOpen: false,
  setMobileOpen: (mobileOpen) => set({ mobileOpen }),
}))
