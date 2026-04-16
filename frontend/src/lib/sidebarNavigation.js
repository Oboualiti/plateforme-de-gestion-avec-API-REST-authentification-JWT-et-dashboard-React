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
    createItem('Users', '/admin/users', ['/admin/users/create', '/admin/permissions', '/admin/permissions/']),
    createItem('Roles', '/admin/roles'),
    createItem('Permissions', '/admin/permissions-catalog', ['/admin/permissions']),
    createItem('Delegation Rules', '/admin/delegation-rules'),
  ]),
  createSection('operations', 'Operations', 'ops', [
    createItem('Requests', '/admin/requests'),
    createItem('Assignments', '/admin/assignments'),
    createItem('Status Tracking', '/admin/status-tracking'),
  ]),
  createSection('monitoring', 'Monitoring', 'monitor', [
    createItem('Audit Logs', '/admin/audit-logs'),
    createItem('Notifications', '/admin/notifications'),
    createItem('Reports', '/admin/reports'),
  ]),
]

const roleVariantMap = {
  super_admin: [
    createSection('platform', 'Platform', 'home', [
      createItem('Dashboard', '/admin/dashboard', ['/dashboard']),
    ]),
    ...enterpriseSections,
  ],
  senior: [
    createSection('oversight', 'Overview', 'home', [
      createItem('Dashboard', '/admin/dashboard', ['/dashboard']),
    ]),
    enterpriseSections[0],
    enterpriseSections[2],
    enterpriseSections[3],
  ],
  manager: [
    createSection('team', 'Team / Users', 'team', [
      createItem('Team Users', '/admin/users', ['/admin/users/create', '/admin/permissions']),
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
      createItem('Members', '/admin/users', ['/admin/users/create', '/admin/permissions']),
    ]),
    createSection('tracking', 'Tracking', 'track', [
      createItem('Queue History', '/admin/status-tracking'),
    ]),
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
