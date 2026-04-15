import axios from 'axios'

const ACCESS_KEY = 'accessToken'
const REFRESH_KEY = 'refreshToken'

export function getStoredTokens() {
  return {
    access: localStorage.getItem(ACCESS_KEY) || '',
    refresh: localStorage.getItem(REFRESH_KEY) || '',
  }
}

export function saveTokens(tokens) {
  localStorage.setItem(ACCESS_KEY, tokens.access || '')
  localStorage.setItem(REFRESH_KEY, tokens.refresh || '')
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

export const api = axios.create({
  baseURL: '/api',
})

api.interceptors.request.use((config) => {
  const { access } = getStoredTokens()
  if (access) {
    config.headers.Authorization = `Bearer ${access}`
  }
  return config
})

let refreshingPromise = null

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    const status = error.response?.status
    const { refresh } = getStoredTokens()

    if (status !== 401 || !refresh || originalRequest._retry) {
      return Promise.reject(error)
    }

    originalRequest._retry = true
    refreshingPromise =
      refreshingPromise ||
      axios.post('/api/auth/refresh/', {
        refresh,
      })

    try {
      const response = await refreshingPromise
      saveTokens({
        access: response.data.access,
        refresh,
      })
      originalRequest.headers.Authorization = `Bearer ${response.data.access}`
      return api(originalRequest)
    } catch (refreshError) {
      clearTokens()
      return Promise.reject(refreshError)
    } finally {
      refreshingPromise = null
    }
  },
)
