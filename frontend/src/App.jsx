import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [form, setForm] = useState({ username: 'prod', password: 'test12345' })
  const [auth, setAuth] = useState(() => ({
    access: localStorage.getItem('accessToken') || '',
    refresh: localStorage.getItem('refreshToken') || '',
  }))
  const [me, setMe] = useState(null)
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      setLoading(true)
      setError('')
      try {
        const healthResponse = await fetch('/api/health/')
        if (!healthResponse.ok) {
          throw new Error(`Health check failed: ${healthResponse.status}`)
        }
        const nextHealth = await healthResponse.json()
        if (!cancelled) {
          setHealth(nextHealth)
        }

        if (!auth.access) {
          if (!cancelled) {
            setMe(null)
          }
          return
        }

        const meResponse = await fetch('/api/auth/me/', {
          headers: {
            Authorization: `Bearer ${auth.access}`,
          },
        })
        if (meResponse.status === 401) {
          localStorage.removeItem('accessToken')
          localStorage.removeItem('refreshToken')
          if (!cancelled) {
            setAuth({ access: '', refresh: '' })
            setMe(null)
          }
          return
        }
        if (!meResponse.ok) {
          throw new Error(`Profile request failed: ${meResponse.status}`)
        }
        const profile = await meResponse.json()
        if (!cancelled) {
          setMe(profile)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Unknown error')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    bootstrap()
    return () => {
      cancelled = true
    }
  }, [auth.access])

  async function handleLogin(event) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/auth/login/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.detail || 'Login failed')
      }
      localStorage.setItem('accessToken', data.access)
      localStorage.setItem('refreshToken', data.refresh)
      setAuth({ access: data.access, refresh: data.refresh })
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unknown error')
      setLoading(false)
    }
  }

  function handleLogout() {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    setAuth({ access: '', refresh: '' })
    setMe(null)
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">Request Service MVP</p>
        <h1>Auth-first frontend shell for the Django API</h1>
        <p className="subtitle">
          Use the seeded users to log in and verify the new backend auth flow.
        </p>
      </section>

      <section className="content-grid">
        <form className="panel" onSubmit={handleLogin}>
          <div className="panel-head">
            <h2>Sign in</h2>
            <span>{loading ? 'Loading...' : 'Ready'}</span>
          </div>

          <label htmlFor="username">Username</label>
          <input
            id="username"
            value={form.username}
            onChange={(event) =>
              setForm((current) => ({ ...current, username: event.target.value }))
            }
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={form.password}
            onChange={(event) =>
              setForm((current) => ({ ...current, password: event.target.value }))
            }
          />

          <div className="button-row">
            <button type="submit">Login</button>
            {auth.access && (
              <button type="button" className="ghost-button" onClick={handleLogout}>
                Logout
              </button>
            )}
          </div>
          {error && <p className="error">{error}</p>}
        </form>

        <section className="panel">
          <div className="panel-head">
            <h2>System</h2>
          </div>
          <div className="data-list">
            <p>Backend: {health?.status || 'Unavailable'}</p>
            <p>Service: {health?.service || '-'}</p>
            <p>Time: {health?.timestamp || '-'}</p>
          </div>
        </section>
      </section>

      <section className="content-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>My profile</h2>
          </div>
          {me ? (
            <div className="data-list">
              <p>
                Name: {me.first_name} {me.last_name}
              </p>
              <p>Email: {me.email}</p>
              <p>Company: {me.company_name || '-'}</p>
              <p>Entity: {me.entity_name || '-'}</p>
              <p>Role: {me.is_staff ? 'Staff' : 'User'}</p>
            </div>
          ) : (
            <p className="muted">Login to load your profile.</p>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Pages</h2>
          </div>
          <div className="page-list">
            <article>
              <strong>Dashboard</strong>
              <p>Backend status and account summary.</p>
            </article>
            <article>
              <strong>Requests</strong>
              <p>Placeholder for request list and actions.</p>
            </article>
            <article>
              <strong>Teams</strong>
              <p>Company and entity context for authenticated users.</p>
            </article>
          </div>
        </section>
      </section>
    </main>
  )
}

export default App
