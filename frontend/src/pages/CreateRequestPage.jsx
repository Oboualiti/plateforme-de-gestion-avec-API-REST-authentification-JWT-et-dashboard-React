import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import PageHeader from '../components/layout/PageHeader'
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
          <p className="eyebrow">Access</p>
          <h1 className="empty-state-title">Request creation is unavailable</h1>
          <p className="subtitle">Only users from production entities can create requests.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Create request"
        title="New request"
        description="Create a request with a clear title, request type, target team, and supporting details."
      />

      <section className="request-create-grid">
        <div className="request-create-main">
          <section className="panel">
            <div className="workspace-section-title">
              <div>
                <p className="eyebrow">Form</p>
                <h2>Request information</h2>
              </div>
            </div>

            <form className="stack-form" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="title">Request title</label>
                <input
                  id="title"
                  placeholder="Enter a short request title"
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, title: event.target.value }))
                  }
                />
              </div>

              <div className="filter-grid-wide">
                <div>
                  <label htmlFor="type">Request type</label>
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
                </div>

                <div>
                  <label htmlFor="source_entity">Source entity</label>
                  <input
                    id="source_entity"
                    value={user.source_entity?.label || ''}
                    disabled
                    readOnly
                  />
                </div>

                <div>
                  <label htmlFor="target_team">Target team</label>
                  <select
                    id="target_team"
                    className="app-select"
                    value={form.target_team}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, target_team: event.target.value }))
                    }
                  >
                    <option value="">Select a support or development team</option>
                    {user.available_target_teams?.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  className="app-textarea"
                  placeholder="Describe the request, expected result, and relevant context"
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, description: event.target.value }))
                  }
                />
              </div>

              <div className="page-actions">
                <button type="submit" disabled={loading}>
                  {loading ? 'Submitting...' : 'Submit request'}
                </button>
                <button type="button" className="ghost-button" onClick={() => navigate('/requests')}>
                  Cancel
                </button>
              </div>
              {error && <p className="error-text">{error}</p>}
            </form>
          </section>
        </div>

        <aside className="request-create-side">
          <section className="panel">
            <p className="eyebrow">Guidance</p>
            <h3>Submission rules</h3>
            <div className="workspace-list">
              <div className="workspace-list-item">
                <div>
                  <strong>Routing</strong>
                  <p className="muted-text">Only support and development entities are available as targets.</p>
                </div>
              </div>
              <div className="workspace-list-item">
                <div>
                  <strong>Scope</strong>
                  <p className="muted-text">Requests stay scoped to your company and source production entity.</p>
                </div>
              </div>
              <div className="workspace-list-item">
                <div>
                  <strong>Quality</strong>
                  <p className="muted-text">Use clear descriptions so the target team can triage quickly.</p>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </section>
    </main>
  )
}

export default CreateRequestPage
