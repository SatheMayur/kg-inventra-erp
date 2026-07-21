'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface User {
  id: string
  empId: string
  name: string
  department: string
  floor: string
  role: string
  isDeptHead?: boolean
  active: boolean
}

interface AppState {
  user: User | null
  setUser: (user: User | null) => void

  currentView: string
  setCurrentView: (view: string) => void

  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void

  pendingCount: number
  setPendingCount: (count: number) => void

  flags: Record<string, boolean>
  setFlags: (flags: Record<string, boolean>) => void
  updateFlag: (key: string, value: boolean) => void

  reset: () => void
}

const initialState = {
  user: null,
  currentView: 'dashboard',
  sidebarOpen: true,
  pendingCount: 0,
  flags: {
    csvExport: true,
    tooltips: true,
    reporting: true,
    barcode: false,
  },
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ...initialState,

      setUser: (user) =>
        set((state) => ({
          user,
          currentView: 'dashboard',
          pendingCount: 0,
        })),

      setCurrentView: (currentView) => set({ currentView }),

      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

      setPendingCount: (pendingCount) => set({ pendingCount }),

      setFlags: (flags) => set({ flags }),

      updateFlag: (key, value) =>
        set((state) => ({ flags: { ...state.flags, [key]: value } })),

      reset: () => {
        set(initialState)
        if (typeof window !== 'undefined') {
          localStorage.removeItem('storehub-storage')
        }
      },
    }),
    {
      name: 'storehub-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        flags: state.flags,
        currentView: state.currentView,
      }),
    }
  )
)
