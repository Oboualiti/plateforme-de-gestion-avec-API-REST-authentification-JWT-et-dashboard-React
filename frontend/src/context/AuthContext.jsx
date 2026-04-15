import { createContext, useContext, useEffect, useState } from 'react'

import { api, clearTokens, getStoredTokens, saveTokens } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [tokens, setTokens] = useState(() => getStoredTokens())
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

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
  }, [tokens.access])

  async function login(credentials) {
    const response = await api.post('/auth/login/', credentials)
    saveTokens(response.data)
    setTokens(response.data)
    const meResponse = await api.get('/auth/me/')
    setUser(meResponse.data)
    return meResponse.data
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
