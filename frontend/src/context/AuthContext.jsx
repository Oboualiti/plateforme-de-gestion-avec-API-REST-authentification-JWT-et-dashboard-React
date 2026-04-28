import { createContext, useCallback, useContext, useEffect, useState } from 'react'

import { api, clearTokens, getStoredTokens, saveTokens } from '../lib/api'
import { useTheme } from './ThemeContext'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const { setThemePreference } = useTheme()
  const [tokens, setTokens] = useState(() => getStoredTokens())
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    if (!getStoredTokens().access) {
      setUser(null)
      return null
    }

    const response = await api.get('/auth/me/')
    if (response.data.theme_preference) {
      setThemePreference(response.data.theme_preference)
    }
    setUser(response.data)
    return response.data
  }, [setThemePreference])

  useEffect(() => {
    let active = true

    async function bootstrap() {
      if (!tokens.access) {
        if (active) {
          setUser(null)
          setLoading(false)
        }
        return
      }

      try {
        const response = await api.get('/auth/me/')
        if (active) {
          if (response.data.theme_preference) {
            setThemePreference(response.data.theme_preference)
          }
          setUser(response.data)
        }
      } catch {
        clearTokens()
        if (active) {
          setTokens({ access: '', refresh: '' })
          setUser(null)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    setLoading(true)
    bootstrap()
    return () => {
      active = false
    }
  }, [setThemePreference, tokens.access])

  async function login(credentials) {
    const response = await api.post('/auth/login/', credentials)
    saveTokens(response.data)
    setTokens(response.data)
    return refreshUser()
  }

  function logout() {
    clearTokens()
    setTokens({ access: '', refresh: '' })
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        tokens,
        loading,
        isAuthenticated: Boolean(tokens.access),
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return context
}
