import { useMemo, useState } from 'react'
import { Building2, KeyRound, ShieldCheck } from 'lucide-react'

import { Avatar } from '../components/Avatar'
import PageHeader from '../components/layout/PageHeader'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { ENTITY_TYPE_LABELS, getEntityTypeTone } from '../lib/entityTypeTheme'

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  senior: 'Senior',
  manager: 'Manager',
  team_leader: 'Team Leader',
  user: 'User',
}

function EntityTypeBadge({ type }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${getEntityTypeTone(type, 'soft')}`}>
      {ENTITY_TYPE_LABELS[type] || type || '-'}
    </span>
  )
}

function ProfilePage() {
  const { user } = useAuth()
  const isSuperAdmin = (user?.role_keys || []).includes('super_admin')
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  })
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)

  const fullName = useMemo(
    () => `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.username || 'User',
    [user?.first_name, user?.last_name, user?.username],
  )
  const roleKey = user?.role_keys?.[0] || 'user'
  const roleLabel = ROLE_LABELS[roleKey] || roleKey.replaceAll('_', ' ')

  if (!user) return null

  async function handlePasswordSubmit(event) {
    event.preventDefault()
    setPasswordMessage('')
    setPasswordError('')

    if (!passwordForm.current_password || !passwordForm.new_password || !passwordForm.confirm_password) {
      setPasswordError('All password fields are required.')
      return
    }
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setPasswordError('New password and confirmation do not match.')
      return
    }

    setIsUpdatingPassword(true)
    try {
      const response = await api.post('/auth/change-password/', passwordForm)
      setPasswordMessage(response.data?.detail || 'Password updated successfully.')
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' })
    } catch (error) {
      const payload = error?.response?.data || {}
      const firstKey = Object.keys(payload)[0]
      const firstValue = firstKey ? payload[firstKey] : ''
      const message = Array.isArray(firstValue) ? firstValue[0] : firstValue
      setPasswordError(message || payload.detail || 'Could not update password.')
    } finally {
      setIsUpdatingPassword(false)
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title="Profile & account"
        description="Manage your personal information and preferences."
      />

      <section className="surface-card shadow-none p-6">
        <div className="flex items-center gap-4">
          <Avatar name={fullName} size={64} />
          <div>
            <div className="text-lg font-semibold">{fullName}</div>
            <div className="text-sm text-muted-foreground">{user?.email || '-'}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary">
                <ShieldCheck className="h-3 w-3" /> {roleLabel}
              </span>
              {!isSuperAdmin && (
                <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 font-medium text-white">
                  <Building2 className="h-3 w-3" /> {user?.company_name || '-'}
                </span>
              )}
              <EntityTypeBadge type={user?.entity_type} />
            </div>
          </div>
        </div>
      </section>

      <section className="surface-card shadow-none p-6">
        <h2 className="text-base font-semibold">Personal information</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Full name</label>
            <Input defaultValue={fullName} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Email</label>
            <Input defaultValue={user?.email || ''} type="email" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Company</label>
            <Input value={isSuperAdmin ? '-' : (user?.company_name || '-')} disabled readOnly />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Entity</label>
            <Input value={user?.entity_name ? `${user.entity_name} - ${user?.entity_type || '-'}` : '-'} disabled readOnly />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline">Cancel</Button>
          <Button>Save changes</Button>
        </div>
      </section>

      <section className="surface-card shadow-none p-6">
        <h2 className="text-base font-semibold">Account settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">Update your password and security preferences.</p>
        {passwordError && <p className="mt-2 text-sm font-medium text-destructive">{passwordError}</p>}
        {passwordMessage && <p className="mt-2 text-sm font-medium text-success">{passwordMessage}</p>}

        <form className="mt-4" onSubmit={handlePasswordSubmit}>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Current password</label>
              <Input
                type="password"
                placeholder="********"
                value={passwordForm.current_password}
                onChange={(event) => setPasswordForm((current) => ({ ...current, current_password: event.target.value }))}
                disabled={isUpdatingPassword}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">New password</label>
              <Input
                type="password"
                placeholder="********"
                value={passwordForm.new_password}
                onChange={(event) => setPasswordForm((current) => ({ ...current, new_password: event.target.value }))}
                disabled={isUpdatingPassword}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Confirm password</label>
              <Input
                type="password"
                placeholder="********"
                value={passwordForm.confirm_password}
                onChange={(event) => setPasswordForm((current) => ({ ...current, confirm_password: event.target.value }))}
                disabled={isUpdatingPassword}
              />
            </div>
          </div>

          <div className="mt-4 space-y-3 text-sm">
            <label className="flex items-center gap-3 rounded-md border border-border p-3">
              <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-border accent-primary" />
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <span>Require password re-entry for sensitive actions</span>
            </label>
            <label className="flex items-center gap-3 rounded-md border border-border p-3">
              <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-border accent-primary" />
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <span>Enable stronger password policy reminders</span>
            </label>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPasswordForm({ current_password: '', new_password: '', confirm_password: '' })
                setPasswordMessage('')
                setPasswordError('')
              }}
              disabled={isUpdatingPassword}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isUpdatingPassword}>
              {isUpdatingPassword ? 'Updating...' : 'Update settings'}
            </Button>
          </div>
        </form>
      </section>
    </main>
  )
}

export default ProfilePage
