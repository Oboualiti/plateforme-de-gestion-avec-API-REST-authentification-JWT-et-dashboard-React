import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import PageHeader from '../components/layout/PageHeader'
import { useAuth } from '../context/AuthContext'

const roles = ['super_admin', 'senior', 'manager', 'team_leader', 'user']

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  senior: 'Senior',
  manager: 'Manager',
  team_leader: 'Team Leader',
  user: 'User',
}

const CHECK_ICON = (
  <svg className="mx-auto h-4 w-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
)

const MINUS_ICON = (
  <svg className="mx-auto h-4 w-4 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
  </svg>
)

const PERMISSION_MATRIX = {
  manage_companies: { group: 'Organization', desc: 'Create / edit / disable companies', allowed: ['super_admin'] },
  view_all_companies: { group: 'Organization', desc: 'View all companies', allowed: ['super_admin'] },
  manage_entities: { group: 'Organization', desc: 'Create / edit / disable entities', allowed: ['super_admin', 'senior'] },
  view_company_entities: { group: 'Organization', desc: 'View company entities', allowed: ['super_admin', 'senior', 'manager', 'team_leader'] },
  manage_users_global: { group: 'Access Control', desc: 'Invite / deactivate globally', allowed: ['super_admin'] },
  manage_users_company: { group: 'Access Control', desc: 'Invite / deactivate within company', allowed: ['super_admin', 'senior'] },
  manage_users_entity: { group: 'Access Control', desc: 'Invite / deactivate within entity', allowed: ['super_admin', 'senior', 'manager'] },
  manage_users_team: { group: 'Access Control', desc: 'Manage team members', allowed: ['super_admin', 'senior', 'manager', 'team_leader'] },
  create_request: { group: 'Requests', desc: 'Open a new request', allowed: ['super_admin', 'senior', 'manager', 'team_leader', 'user'] },
  view_all_requests: { group: 'Requests', desc: 'View all requests', allowed: ['super_admin'] },
  view_company_requests: { group: 'Requests', desc: 'View company requests', allowed: ['super_admin', 'senior'] },
  view_entity_requests: { group: 'Requests', desc: 'View entity requests', allowed: ['super_admin', 'senior', 'manager'] },
  view_team_requests: { group: 'Requests', desc: 'View team requests', allowed: ['super_admin', 'senior', 'manager', 'team_leader'] },
  view_own_requests: { group: 'Requests', desc: 'View own requests', allowed: ['super_admin', 'senior', 'manager', 'team_leader', 'user'] },
  approve_request_tl: { group: 'Requests', desc: 'Accept / reject as Team Leader', allowed: ['super_admin', 'senior', 'manager', 'team_leader'] },
  approve_request_mgr: { group: 'Requests', desc: 'Accept / reject as Manager', allowed: ['super_admin', 'senior', 'manager'] },
  approve_request_snr: { group: 'Requests', desc: 'Accept / reject as Senior', allowed: ['super_admin', 'senior'] },
  assign_request: { group: 'Requests', desc: 'Change assignee', allowed: ['super_admin', 'senior', 'manager', 'team_leader'] },
  resolve_request: { group: 'Requests', desc: 'Mark as resolved', allowed: ['super_admin', 'senior'] },
  close_request: { group: 'Requests', desc: 'Permanently close a request', allowed: ['super_admin', 'senior', 'manager'] },
  view_global_reports: { group: 'Monitoring', desc: 'View global analytics', allowed: ['super_admin'] },
  view_company_reports: { group: 'Monitoring', desc: 'View company analytics', allowed: ['super_admin', 'senior'] },
  view_entity_reports: { group: 'Monitoring', desc: 'View entity analytics', allowed: ['super_admin', 'senior', 'manager'] },
  export_data: { group: 'Monitoring', desc: 'Export data', allowed: ['super_admin', 'senior', 'manager'] },
}

function groupPermissions(matrix) {
  const groups = {}
  Object.entries(matrix).forEach(([key, data]) => {
    if (!groups[data.group]) {
      groups[data.group] = []
    }
    groups[data.group].push({ name: key, ...data })
  })
  return Object.entries(groups).map(([group, perms]) => ({ group, perms }))
}

function PermissionsPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(false)
  }, [])

  const permissionGroups = groupPermissions(PERMISSION_MATRIX)

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Access Control"
        title="Permissions"
        description="Granular permission matrix per role. Overrides can be set per user."
        meta={
          <>
            <span className="status-tag info">{user?.role_keys?.[0]?.replaceAll('_', ' ') || 'user'}</span>
            <span className="muted-text">{user?.company_name || 'Global'}</span>
          </>
        }
      />

      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Permission</th>
                {roles.map((r) => (
                  <th key={r} className="px-4 py-3 text-center font-medium">{ROLE_LABELS[r]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permissionGroups.flatMap((g) => [
                <tr key={`g-${g.group}`} className="bg-muted/20">
                  <td colSpan={roles.length + 1} className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {g.group}
                  </td>
                </tr>,
                ...g.perms.map((p) => (
                  <tr key={`${g.group}-${p.name}`} className="data-table-row border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</div>
                      <div className="text-xs text-muted-foreground">{p.desc}</div>
                    </td>
                    {roles.map((r) => (
                      <td key={r} className="px-4 py-3 text-center">
                        {p.allowed.includes(r) ? CHECK_ICON : MINUS_ICON}
                      </td>
                    ))}
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}

export default PermissionsPage