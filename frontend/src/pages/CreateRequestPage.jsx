import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

const requestTypes = ['INFO', 'SCRIPT', 'TOOL', 'APP_PROJECT']

function CreateRequestPage() {
  const navigate = useNavigate()
  const { user, refreshUser } = useAuth()
  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'INFO',
    target_team: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    refreshUser().catch(() => {})
  }, [refreshUser])

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.post('/requests/', {
        title: form.title,
        description: form.description,
        type: form.type,
        target_team: Number(form.target_team),
      })
      navigate('/requests', { replace: true })
    } catch (nextError) {
      setError(nextError.response?.data?.detail || 'Could not create request.')
    } finally {
      setLoading(false)
    }
  }

  if (!user?.request_creation_allowed) {
    return (
      <main className="page-content">
        <section className="panel state-card">
          <h1>Create access unavailable</h1>
          <p className="subtitle">
            Only users from production entities can create requests.
          </p>
        </section>
      </main>
    )
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
            onChange={(event) =>
              setForm((current) => ({ ...current, title: event.target.value }))
            }
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

          <label htmlFor="type">Request Type</label>
          <select
            id="type"
            className="app-select"
            value={form.type}
            onChange={(event) =>
              setForm((current) => ({ ...current, type: event.target.value }))
            }
          >
            {requestTypes.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <label htmlFor="source_entity">Source entity</label>
          <input
            id="source_entity"
            value={user.source_entity?.label || ''}
            disabled
            readOnly
          />

          <label htmlFor="target_team">Target team</label>
          <select
            id="target_team"
            className="app-select"
            value={form.target_team}
            onChange={(event) =>
              setForm((current) => ({ ...current, target_team: event.target.value }))
            }
          >
            <option value="">Select a support/dev team</option>
            {user.available_target_teams?.map((team) => (
              <option key={team.id} value={team.id}>
                {team.label}
              </option>
            ))}
          </select>

          <button type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Submit request'}
          </button>
          {error && <p className="error-text">{error}</p>}
        </form>
      </section>
    </main>
  )
}

export default CreateRequestPage
