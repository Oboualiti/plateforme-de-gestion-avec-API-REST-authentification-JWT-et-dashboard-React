ROLE_HIERARCHY = {
    "super_admin": 7,
    "senior": 6,
    "manager": 5,
    "team_leader": 4,
    "user": 2,
}


PERMISSION_DEFINITIONS = [
    {
        "key": "manage_companies",
        "name": "Manage Companies",
        "description": "Create, edit, or delete companies.",
        "category": "organization",
    },
    {
        "key": "view_all_companies",
        "name": "View All Companies",
        "description": "View all companies in read-only mode.",
        "category": "organization",
    },
    {
        "key": "manage_entities",
        "name": "Manage Entities",
        "description": "Create, edit, or delete entities.",
        "category": "organization",
    },
    {
        "key": "view_company_entities",
        "name": "View Company Entities",
        "description": "View entities belonging to the current company.",
        "category": "organization",
    },
    {
        "key": "manage_users_global",
        "name": "Manage Users Global",
        "description": "Create, update, and deactivate users globally.",
        "category": "user_management",
    },
    {
        "key": "manage_users_company",
        "name": "Manage Users Company",
        "description": "Manage users within the same company.",
        "category": "user_management",
    },
    {
        "key": "manage_users_entity",
        "name": "Manage Users Entity",
        "description": "Manage users within the same entity.",
        "category": "user_management",
    },
    {
        "key": "create_request",
        "name": "Create Request",
        "description": "Create a new request.",
        "category": "requests",
    },
    {
        "key": "view_all_requests",
        "name": "View All Requests",
        "description": "View all requests in the system.",
        "category": "requests",
    },
    {
        "key": "view_company_requests",
        "name": "View Company Requests",
        "description": "View requests inside the current company.",
        "category": "requests",
    },
    {
        "key": "view_entity_requests",
        "name": "View Entity Requests",
        "description": "View requests inside the current entity.",
        "category": "requests",
    },
    {
        "key": "view_team_requests",
        "name": "View Team Requests",
        "description": "View requests for the current team.",
        "category": "requests",
    },
    {
        "key": "view_own_requests",
        "name": "View Own Requests",
        "description": "View own requests only.",
        "category": "requests",
    },
    {
        "key": "approve_request",
        "name": "Approve Request",
        "description": "Approve requests in approval workflow.",
        "category": "actions",
    },
    {
        "key": "assign_request",
        "name": "Assign Request",
        "description": "Assign requests to a user or team.",
        "category": "actions",
    },
    {
        "key": "resolve_request",
        "name": "Resolve Request",
        "description": "Mark work as completed or resolved.",
        "category": "actions",
    },
    {
        "key": "close_request",
        "name": "Close Request",
        "description": "Finalize and close the request.",
        "category": "actions",
    },
    {
        "key": "view_global_reports",
        "name": "View Global Reports",
        "description": "Access global reporting.",
        "category": "reporting",
    },
    {
        "key": "view_company_reports",
        "name": "View Company Reports",
        "description": "Access company reporting.",
        "category": "reporting",
    },
    {
        "key": "view_entity_reports",
        "name": "View Entity Reports",
        "description": "Access entity reporting.",
        "category": "reporting",
    },
    {
        "key": "export_data",
        "name": "Export Data",
        "description": "Export reporting data.",
        "category": "reporting",
    },
    {
        "key": "view_audit_logs",
        "name": "View All Logs",
        "description": "View all system audit logs.",
        "category": "monitoring",
    },
    {
        "key": "view_user_audit_logs",
        "name": "View User Logs",
        "description": "View user management audit logs.",
        "category": "monitoring",
    },
    {
        "key": "view_access_audit_logs",
        "name": "View Access Logs",
        "description": "View role and permission change logs.",
        "category": "monitoring",
    },
    {
        "key": "view_org_audit_logs",
        "name": "View Organization Logs",
        "description": "View company and entity change logs.",
        "category": "monitoring",
    },
]


DEFAULT_ROLE_PERMISSION_MATRIX = {
    "super_admin": {definition["key"] for definition in PERMISSION_DEFINITIONS},
    "senior": {
        "manage_entities",
        "view_company_entities",
        "manage_users_company",
        "create_request",
        "view_company_requests",
        "view_entity_requests",
        "view_team_requests",
        "view_own_requests",
        "approve_request",
        "assign_request",
        "resolve_request",
        "close_request",
        "view_company_reports",
        "view_entity_reports",
        "export_data",
        "view_audit_logs",
        "view_user_audit_logs",
        "view_access_audit_logs",
        "view_org_audit_logs",
    },
    "manager": {
        "view_company_entities",
        "manage_users_entity",
        "create_request",
        "view_entity_requests",
        "view_team_requests",
        "view_own_requests",
        "approve_request",
        "assign_request",
        "close_request",
        "view_entity_reports",
        "export_data",
        "view_user_audit_logs",
        "view_access_audit_logs",
        "view_org_audit_logs",
    },
    "team_leader": {
        "view_company_entities",
        "create_request",
        "view_team_requests",
        "view_own_requests",
        "approve_request",
        "assign_request",
        "view_user_audit_logs",
        "view_org_audit_logs",
    },
    "user": {
        "create_request",
        "view_own_requests",
        "close_request",
    },
}


ROLE_DEFINITIONS = [
    ("super_admin", "Super Admin"),
    ("senior", "Senior"),
    ("manager", "Manager"),
    ("team_leader", "Team Leader"),
    ("user", "User"),
]


DELEGATION_ROLES = {"super_admin", "senior", "manager", "team_leader"}


LEGACY_PERMISSION_KEY_MAPPING = {
    "approve_request_tl": "approve_request",
    "approve_request_mgr": "approve_request",
    "approve_request_snr": "approve_request",
}
