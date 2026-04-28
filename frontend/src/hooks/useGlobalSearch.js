import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { api } from '../lib/api'

export function useGlobalSearch() {
  const location = useLocation()
  const navigate = useNavigate()
  const blurTimeoutRef = useRef(null)
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState({
    requests: [],
    users: [],
    entities: [],
  })

  useEffect(() => {
    if (location.pathname !== '/requests') return
    const params = new URLSearchParams(location.search)
    setQuery(params.get('search') || '')
  }, [location.pathname, location.search])

  useEffect(() => {
    const trimmedQuery = query.trim()
    if (trimmedQuery.length < 2) {
      setLoading(false)
      setSuggestions({ requests: [], users: [], entities: [] })
      return
    }

    let active = true
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const response = await api.get('/admin/global-search/', {
          params: { q: trimmedQuery, limit: 5 },
        })
        if (!active) return
        setSuggestions({
          requests: Array.isArray(response.data?.requests) ? response.data.requests : [],
          users: Array.isArray(response.data?.users) ? response.data.users : [],
          entities: Array.isArray(response.data?.entities) ? response.data.entities : [],
        })
      } catch {
        if (!active) return
        setSuggestions({ requests: [], users: [], entities: [] })
      } finally {
        if (active) setLoading(false)
      }
    }, 120)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [query])

  function handleSubmit(event) {
    event.preventDefault()
    const params = new URLSearchParams()
    const trimmedQuery = query.trim()

    if (location.pathname === '/requests') {
      const currentParams = new URLSearchParams(location.search)
      const currentScope = currentParams.get('scope')
      if (currentScope) params.set('scope', currentScope)
    }
    if (trimmedQuery) params.set('search', trimmedQuery)

    navigate(`/requests${params.toString() ? `?${params.toString()}` : ''}`)
    setIsOpen(false)
  }

  function handleFocus() {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current)
      blurTimeoutRef.current = null
    }
    setIsOpen(true)
  }

  function handleBlur() {
    blurTimeoutRef.current = setTimeout(() => {
      setIsOpen(false)
    }, 140)
  }

  function handleSuggestionClick(item) {
    setIsOpen(false)
    setQuery(item.label || '')
    navigate(item.link)
  }

  const totalSuggestions =
    suggestions.requests.length + suggestions.users.length + suggestions.entities.length

  return {
    query,
    setQuery,
    isOpen,
    loading,
    suggestions,
    totalSuggestions,
    handleSubmit,
    handleFocus,
    handleBlur,
    handleSuggestionClick,
  }
}
