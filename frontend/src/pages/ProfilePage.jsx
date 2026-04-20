import { useMemo } from 'react'

import PageHeader from '../components/layout/PageHeader'
import { useAuth } from '../context/AuthContext'

function ProfilePage() {
  const { user } = useAuth()
  const primaryRole = useMemo(
    () => user?.role_keys?.[0]?.replaceAll('_', ' ') || 'user',
    [user?.role_keys],
  )

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Profile"
        title={user?.first_name || user?.username || 'User Profile'}
        description="Your account and workspace identity details."
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="surface-card p-4">
          <p className="text-xs text-muted-foreground">Username</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{user?.username || '-'}</p>
          <p className="mt-1 text-xs text-muted-foreground">Login identity</p>
        </article>
        <article className="surface-card p-4">
          <p className="text-xs text-muted-foreground">Primary Role</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{primaryRole}</p>
          <p className="mt-1 text-xs text-muted-foreground">Current permission lane</p>
        </article>
        <article className="surface-card p-4">
          <p className="text-xs text-muted-foreground">Company</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{user?.company_name || '-'}</p>
          <p className="mt-1 text-xs text-muted-foreground">Business scope</p>
        </article>
        <article className="surface-card p-4">
          <p className="text-xs text-muted-foreground">Entity</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{user?.entity_name || '-'}</p>
          <p className="mt-1 text-xs text-muted-foreground">Operational unit</p>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="surface-card p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Account Details</p>
          <div className="mt-4 space-y-2">
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Full Name</p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {`${user?.first_name || ''} ${user?.last_name || ''}`.trim() || '-'}
              </p>
            </div>
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="mt-1 text-sm font-medium text-foreground">{user?.email || 'No email set'}</p>
            </div>
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Entity Type</p>
              <p className="mt-1 text-sm font-medium text-foreground">{user?.entity_type || '-'}</p>
            </div>
          </div>
        </article>

        <article className="surface-card p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Permissions</p>
          <div className="mt-4 space-y-2">
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Roles</p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {(user?.role_keys || []).join(', ').replaceAll('_', ' ') || '-'}
              </p>
            </div>
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Request Creation</p>
              <span
                className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                  user?.request_creation_allowed
                    ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                    : 'border-red-200 bg-red-100 text-red-700'
                }`}
              >
                {user?.request_creation_allowed ? 'Allowed' : 'Not allowed'}
              </span>
            </div>
          </div>
        </article>
      </section>
    </main>
  )
}

export default ProfilePage
