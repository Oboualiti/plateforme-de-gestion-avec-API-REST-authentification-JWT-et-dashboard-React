function createItem(label, to, matchPaths = []) {
  return { label, to, matchPaths: [to].concat(matchPaths) }
}

function createSection(key, label, icon, items) {
  return { key, label, icon, items }
}

const enterpriseSections = [
  createSection('organization', 'Organization', 'org', [
    createItem('Companies', '/admin/companies'),
    createItem('Entities', '/admin/entities'),
    createItem('Hierarchy', '/admin/hierarchy'),
  ]),
  createSection('access-control', 'Access Control', 'lock', [
    createItem('Users', '/admin/users', ['/admin/users/create', '/admin/users/', '/admin/permissions', '/admin/permissions/']),
    createItem('Roles', '/admin/roles'),
  ]),
  createSection('operations', 'Operations', 'ops', [
    createItem('Requests', '/admin/requests'),
    createItem('Assignments', '/admin/assignments'),
    createItem('Status Tracking', '/admin/status-tracking'),
  ]),
  createSection('monitoring', 'Monitoring', 'monitor', [
    createItem('Reports', '/admin/reports'),
  ]),
]

const auditLogsSection = createSection('audit-logs', 'Audit Logs', 'monitor', [
  createItem('Request logs', '/admin/audit-logs/requests', ['/admin/audit-logs/requests']),
  createItem('User logs', '/admin/audit-logs/users', ['/admin/audit-logs/users']),
  createItem('Access / role logs', '/admin/audit-logs/access', ['/admin/audit-logs/access']),
  createItem('Organization logs', '/admin/audit-logs/organization', ['/admin/audit-logs/organization']),
  createItem('Notification logs', '/admin/audit-logs/notifications', ['/admin/audit-logs/notifications']),
])

const roleVariantMap = {
  super_admin: [
    createSection('platform', 'Platform', 'home', [
      createItem('Dashboard', '/admin/dashboard', ['/dashboard']),
    ]),
    ...enterpriseSections,
    auditLogsSection,
  ],
  senior: [
    createSection('oversight', 'Overview', 'home', [
      createItem('Dashboard', '/admin/dashboard', ['/dashboard']),
    ]),
    createSection('company-users', 'Users', 'team', [
      createItem('Company Users', '/admin/users', ['/admin/users/create', '/admin/users/', '/admin/permissions', '/admin/permissions/']),
    ]),
    enterpriseSections[0],
    enterpriseSections[2],
    enterpriseSections[3],
    auditLogsSection,
  ],
  manager: [
    createSection('team', 'Team / Users', 'team', [
      createItem('Team Users', '/admin/users', ['/admin/users/create', '/admin/users/', '/admin/permissions', '/admin/permissions/']),
      createItem('Hierarchy', '/admin/hierarchy'),
    ]),
    createSection('requests', 'Requests', 'ops', [
      createItem('Team Requests', '/admin/requests', ['/requests']),
    ]),
    createSection('assignments', 'Assignments', 'assign', [
      createItem('Assignments', '/admin/assignments'),
    ]),
    createSection('tracking', 'Tracking', 'track', [
      createItem('Status Tracking', '/admin/status-tracking'),
      createItem('Reports', '/admin/reports'),
    ]),
    auditLogsSection,
  ],
  team_leader: [
    createSection('team-queue', 'Team Queue', 'queue', [
      createItem('Incoming Queue', '/admin/requests', ['/requests']),
      createItem('Assignments', '/admin/assignments'),
    ]),
    createSection('requests', 'Requests', 'ops', [
      createItem('Open Requests', '/requests'),
      createItem('Request Tracking', '/admin/status-tracking'),
    ]),
    createSection('team-members', 'Team Members', 'team', [
      createItem('Members', '/admin/users', ['/admin/users/create', '/admin/users/', '/admin/permissions', '/admin/permissions/']),
    ]),
    createSection('tracking', 'Tracking', 'track', [
      createItem('Queue History', '/admin/status-tracking'),
    ]),
    auditLogsSection,
  ],
  production_user: [
    createSection('workspace', 'My Workspace', 'home', [
      createItem('Create Request', '/requests/create'),
      createItem('My Requests', '/requests'),
      createItem('Request Tracking', '/requests'),
    ]),
  ],
  support_team_user: [
    createSection('team-queue', 'Team Queue', 'queue', [
      createItem('Incoming Requests', '/requests'),
      createItem('Assigned to Me', '/requests'),
      createItem('Status Updates', '/requests'),
      createItem('Queue History', '/requests'),
    ]),
  ],
  development_team_user: [
    createSection('dev-queue', 'Dev Queue', 'queue', [
      createItem('Incoming Requests', '/requests'),
      createItem('Assigned to Me', '/requests'),
      createItem('In Progress', '/requests'),
      createItem('Completed / Tracking', '/requests'),
    ]),
  ],
  default: [
    createSection('workspace', 'Workspace', 'home', [
      createItem('Dashboard', '/dashboard'),
      createItem('Requests', '/requests'),
    ]),
  ],
}

export function getSidebarVariant(user) {
  const roleKeys = user?.role_keys || []
  if (roleKeys.includes('super_admin')) return 'super_admin'
  if (roleKeys.includes('senior')) return 'senior'
  if (roleKeys.includes('manager')) return 'manager'
  if (roleKeys.includes('team_leader')) return 'team_leader'
  if (user?.entity_type === 'PROD') return 'production_user'
  if (user?.entity_type === 'SUPPORT') return 'support_team_user'
  if (user?.entity_type === 'TDEV') return 'development_team_user'
  return 'default'
}

export function getSidebarSections(user) {
  return roleVariantMap[getSidebarVariant(user)] || roleVariantMap.default
}
