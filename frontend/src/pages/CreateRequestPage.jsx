import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { api } from '../lib/api'

const priorityOptions = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

function CreateRequestPage() {
  const navigate = useNavigate()
  const [teams, setTeams] = useState([])
  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'General',
    target_team: '',
    priority: 'MEDIUM',
  })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true
    async function loadTeams() {
      try {
        const response = await api.get('/operational-units/')
        if (active) {
          setTeams(response.data)
        }
      } catch {
        if (active) {
          setError('Could not load target teams.')
        }
      }
    }
    loadTeams()
    return () => {
      active = false
    }
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')
    try {
      await api.post('/requests/', form)
      setMessage('Request created successfully.')
      navigate('/requests', { replace: true })
    } catch (nextError) {
      setError(nextError.response?.data?.detail || 'Could not create request.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="page-content">
      <section className="panel form-panel wide-panel">
        <p className="eyebrow">Create request</p>
        <h1>New service request</h1>

        <form onSubmit={handleSubmit}>
          <label htmlFor="title">Title</label>
          <input
            id="title"
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          />

          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            className="app-textarea"
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
          />

          <label htmlFor="type">Type</label>
          <input
            id="type"
            value={form.type}
            onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
          />

          <label htmlFor="target_team">Target team</label>
          <select
            id="target_team"
            className="app-select"
            value={form.target_team}
            onChange={(event) =>
              setForm((current) => ({ ...current, target_team: Number(event.target.value) }))
            }
          >
            <option value="">Select a team</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>

          <label htmlFor="priority">Priority</label>
          <select
            id="priority"
            className="app-select"
            value={form.priority}
            onChange={(event) =>
              setForm((current) => ({ ...current, priority: event.target.value }))
            }
          >
            {priorityOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <button type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Submit request'}
          </button>
          {message && <p className="muted-text">{message}</p>}
          {error && <p className="error-text">{error}</p>}
        </form>
      </section>
    </main>
  )
}

export default CreateRequestPage
