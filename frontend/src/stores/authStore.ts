import { create } from 'zustand'
import api from '../services/api'
import type { User } from '../types'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  setUser: (user: User) => void
  logout: () => void
  init: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  setUser: (user) => {
    localStorage.setItem('user', JSON.stringify(user))
    set({ user, isAuthenticated: true })
  },
  logout: async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // 即使后端调用失败，也清理本地状态
    }
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    set({ user: null, isAuthenticated: false })
    window.location.href = '/login'
  },
  init: () => {
    const stored = localStorage.getItem('user')
    const token = localStorage.getItem('access_token')
    if (stored && token) {
      set({ user: JSON.parse(stored), isAuthenticated: true })
    }
  },
}))