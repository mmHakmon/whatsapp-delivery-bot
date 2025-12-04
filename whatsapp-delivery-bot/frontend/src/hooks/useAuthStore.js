import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../utils/api'

const useAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      admin: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null })
        try {
          const response = await api.post('/auth/login', { email, password })
          const { token, admin } = response.data
          
          set({
            token,
            admin,
            isAuthenticated: true,
            isLoading: false,
          })
          
          return { success: true }
        } catch (error) {
          set({
            isLoading: false,
            error: error.response?.data?.error?.message || 'שגיאה בהתחברות',
          })
          return { success: false, error: error.response?.data?.error?.message }
        }
      },

      logout: () => {
        set({
          token: null,
          admin: null,
          isAuthenticated: false,
          error: null,
        })
      },

      checkAuth: async () => {
        const { token } = get()
        if (!token) return false

        try {
          const response = await api.get('/auth/me')
          set({ admin: response.data.admin, isAuthenticated: true })
          return true
        } catch (error) {
          get().logout()
          return false
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token, admin: state.admin }),
    }
  )
)

export default useAuthStore
