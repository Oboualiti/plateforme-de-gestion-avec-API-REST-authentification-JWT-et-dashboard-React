import { useCallback, useEffect, useState } from 'react'
import './App.css'

function App() {
  const [apiState, setApiState] = useState({
    loading: true,
    error: '',
    data: null,
  })

  const checkBackend = useCallback(async () => {
    setApiState({ loading: true, error: '', data: null })

    try {
      const response = await fetch('/api/health/')
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`)
      }

      const data = await response.json()
      setApiState({ loading: false, error: '', data })
    } catch (error) {
      setApiState({
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: null,
      })
    }
  }, [])

  useEffect(() => {
    checkBackend()
  }, [checkBackend])

  return (
    <main className="app-shell">
      <h1>Frontend to Backend Connection</h1>
      <p className="subtitle">React frontend calling Django API endpoint</p>

      <section className="status-card">
        {apiState.loading && <p>Checking backend connection...</p>}
        {apiState.error && (
          <p className="error">Connection failed: {apiState.error}</p>
        )}
        {apiState.data && (
          <div className="success">
            <p>
              Backend status: <strong>{apiState.data.status}</strong>
            </p>
            <p>Service: {apiState.data.service}</p>
            <p>Timestamp: {apiState.data.timestamp}</p>
          </div>
        )}
      </section>

      <button type="button" className="retry-button" onClick={checkBackend}>
        Retry API Check
      </button>
    </main>
  )
}

export default App
