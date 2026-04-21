import { useMemo } from 'react'
import { Building2, Mail, ShieldCheck } from 'lucide-react'

import { Avatar } from '../components/Avatar'
import PageHeader from '../components/layout/PageHeader'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { useAuth } from '../context/AuthContext'

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  senior: 'Senior',
  manager: 'Manager',
  team_leader: 'Team Leader',
  user: 'User',
}

function EntityTypeBadge({ type }) {
  const tone =
    type === 'PROD'
      ? 'bg-blue-100 text-blue-700'
      : type === 'SUPPORT'
        ? 'bg-emerald-100 text-emerald-700'
        : 'bg-amber-100 text-amber-700'
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${tone}`}>
      {type || '-'}
    </span>
  )
}

function ProfilePage() {
  const { user } = useAuth()
  const isSuperAdmin = (user?.role_keys || []).includes('super_admin')

  const fullName = useMemo(
    () => `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.username || 'User',
    [user?.first_name, user?.last_name, user?.username],
  )
  const roleKey = user?.role_keys?.[0] || 'user'
  const roleLabel = ROLE_LABELS[roleKey] || roleKey.replaceAll('_', ' ')
  const notificationOptions = useMemo(() => {
    const base = [
      'When a request is assigned to me',
      'When a request I created changes status',
      'When someone comments on my requests',
      "Weekly summary of my team's activity",
    ]

    if (roleKey === 'super_admin') {
      return [
        ...base,
        'When a company or entity is created/updated/deactivated',
        'When user roles or permissions are changed',
        'When delegation rules are created or revoked',
        'When critical security or audit events are detected',
      ]
    }

    return base
  }, [roleKey])

  if (!user) return null

  return (
    <main className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title="Profile & account"
        description="Manage your personal information and preferences."
      />

      <section className="surface-card p-6">
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
                <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 font-medium">
                  <Building2 className="h-3 w-3" /> {user?.company_name || '-'}
                </span>
              )}
              <EntityTypeBadge type={user?.entity_type} />
            </div>
          </div>
        </div>
      </section>

      <section className="surface-card p-6">
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

      <section className="surface-card p-6">
        <h2 className="text-base font-semibold">Notifications</h2>
        <p className="mt-1 text-sm text-muted-foreground">Choose what you'd like to be notified about.</p>
        <div className="mt-4 space-y-3 text-sm">
          {notificationOptions.map((label) => (
            <label key={label} className="flex items-center gap-3 rounded-md border border-border p-3">
              <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-border accent-primary" />
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </section>
    </main>
  )
}

export default ProfilePage
