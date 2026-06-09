'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface User {
  id: string
  empId: string
  name: string
  department: string
  floor: string
  role: 'admin' | 'employee'
  active: boolean
}

interface AppState {
  // Auth
  user: User | null
  token: string | null
  setUser: (user: User | null, token?: string | null) => void

  // Current view
  currentView: string
  setCurrentView: (view: string) => void

  // Sidebar
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void

  // Pending count (for badge)
  pendingCount: number
  setPendingCount: (count: number) => void

  // Feature flags
  flags: Record<string, boolean>
  setFlags: (flags: Record<string, boolean>) => void
  updateFlag: (key: string, value: boolean) => void

  // Reset on logout
  reset: () => void
}

const initialState = {
  user: null,
  token: null,
  currentView: 'dashboard',
  sidebarOpen: true,
  pendingCount: 0,
  flags: {},
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ...initialState,

      setUser: (user, token) => set((state) => ({
        user,
        token: token !== undefined ? token : state.token
      })),

      setCurrentView: (currentView) => set({ currentView }),

      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

      setPendingCount: (pendingCount) => set({ pendingCount }),

      setFlags: (flags) => set({ flags }),

      updateFlag: (key, value) =>
        set((state) => ({ flags: { ...state.flags, [key]: value } })),



      reset: () => {
        set(initialState);
        // Purge persisted storage so stale tokens/user data cannot be rehydrated
        if (typeof window !== 'undefined') {
          localStorage.removeItem('storehub-storage');
        }
      },
    }),
    {
      name: 'storehub-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        // token intentionally excluded — stored in httpOnly cookie instead
        flags: state.flags,
        currentView: state.currentView,
      }),
    }
  )
)
