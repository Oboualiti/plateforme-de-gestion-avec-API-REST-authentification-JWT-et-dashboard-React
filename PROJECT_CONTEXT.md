# PROJECT_CONTEXT.md

## 1. Project Summary
This project is an enterprise request-management platform for a company called **EMD**.

The platform is built to manage:
- company hierarchy
- user roles
- entity-based access
- request creation and routing
- support/dev operational queues
- permission delegation
- request tracking, comments, assignments, and monitoring

The system is **multi-company scoped** and must preserve strict separation between business units.

---

## 2. Company Structure

### Parent Company
- **EMD**

### Business Units / Companies
- **WMN**
- **CMH**
- **VMS**

These business units must be handled **separately**.

### Separation Rule
Normal users must **not** see data from other companies.

Examples:
- WMN users must not see CMH/VMS requests, users, entities, or queues
- CMH users must not see WMN/VMS data
- VMS users must not see WMN/CMH data

Only globally authorized roles such as **Super Admin** may have cross-company visibility.

---

## 3. Entity Structure

Each company contains multiple **entities**.

Examples:
- WMN1
- WMN2
- WMN4
- WMNW
- CMH1
- CMH3
- CMHW
- VMS1
- etc.

### Entity Types
Each entity has a type:
- `prod` / `production`
- `support`
- `dev` / `development`

Examples:
- WMN1 = production
- WMN4 = support
- WMNW = dev
- CMH1 = production
- CMH3 = support
- CMHW = dev

Entity type drives business logic and access behavior.

---

## 4. Role Hierarchy

Main system roles:
- **Super Admin**
- **Senior**
- **Manager**
- **Team Leader**
- **User**

### Hierarchy Meaning
- Super Admin = global platform control
- Senior = company-level oversight
- Manager = entity/team management
- Team Leader = supervises users under their scope
- User = normal operational user

### Reporting Logic
Typical structure:
- one Senior per company scope
- one Manager per entity scope
- multiple Team Leaders under a Manager
- multiple Users under a Team Leader

Example:
- WMN
  - Senior
  - WMN1
    - Manager
    - TL1
    - TL2
    - TL3
    - Users under each TL

---

## 5. Core Business Logic

### 5.1 Request Creation
Requests are primarily created by users from **production entities**.

Allowed creators:
- Manager in prod entity
- Team Leader in prod entity
- User in prod entity

Not allowed:
- Senior
- users from support/dev entities
- users outside allowed prod scope

### 5.2 Source Entity
When a request is created:
- source entity comes from the logged-in user
- it should be auto-filled
- it should not be chosen manually if the user already belongs to one entity

Example:
- if logged-in user belongs to `CMH1`, source entity = `CMH1`

### 5.3 Target Entity
A request must be sent to a valid target team/entity.

Rules:
- target must be inside the **same company**
- target must be an entity of type:
  - `support`
  - `dev`

Examples:
- user in CMH1 can target CMH3 or CMHW
- user in WMN1 can target WMN4 or WMNW
- user in WMN1 cannot target CMH3
- user in prod cannot target another prod entity

---

## 6. Request Types

Supported request types:
- **Info**
- **Script**
- **Tool**
- **App/Project**

`Update` was removed from the main simplified flow.

---

## 7. Request Lifecycle

Typical request lifecycle:
- `NEW`
- `IN_PROGRESS`
- `RESOLVED`
- `CLOSED`

Additional statuses may be added later if needed.

### Core Tracking Requirements
Each request should support:
- request reference code
- title
- description
- type
- created_by
- company
- source_entity
- target_entity
- status
- created_at
- comments/discussion
- activity/status history
- assignee when applicable

---

## 8. Request Visibility Rules

### 8.1 Production Side
Prod-side users can:
- create requests if allowed
- view their own requests
- track request progress
- comment on their requests

### 8.2 Support / Dev Side
Support/dev users must only see requests that are targeted to **their exact entity**.

Rules:
- request company must equal logged-in user company
- request target_entity must equal logged-in user entity

Example:
- request from WMN1 sent to WMN4:
  - visible to WMN4 users
  - not visible to WMNW users
  - not visible to CMH users

### 8.3 Admin / Oversight Roles
Admin-level visibility depends on scope:
- Super Admin = global
- Senior = company scope
- Manager = entity/team scope
- Team Leader = lower scoped team/user scope

---

## 9. Assignments

Support/dev workflow supports:
- queue visibility
- request management by the target team
- optional assignee
- “Assign to me” behavior for handlers
- status updates
- comments
- resolution notes

Admin-side operations may include:
- assignment monitoring
- reassignment if authorized
- unassigned request tracking

---

## 10. Permissions Model

The system uses:
- **role-based permissions**
- **user-specific overrides**
- **delegation rules**

### 10.1 Default Permissions
Each role has a default set of permissions.

### 10.2 User Overrides
A specific user may:
- lose a permission
- gain a permission
depending on allowed override logic

### 10.3 Delegation Rules
Permission editing must follow hierarchy and delegation scope.

Examples:
- Senior can manage only permissions Senior is allowed to delegate
- Manager can manage only permissions Manager is allowed to delegate
- TL can manage only permissions TL is allowed to delegate

Also:
- Manager can manage TL/User within allowed hierarchy
- TL can manage only Users within allowed hierarchy
- lower roles must not edit higher roles

Backend is the source of truth.

---

## 11. Admin / Control Center Modules

Main admin sections:
- **Organization**
  - Companies
  - Entities
  - Hierarchy
- **Access Control**
  - Users
  - Roles
  - Permissions
  - Delegation Rules
- **Operations**
  - Requests
  - Assignments
  - Status Tracking
- **Monitoring**
  - Audit Logs
  - Notifications
  - Reports

This structure also influences navigation design and role-based workspace patterns.

---

## 12. Role-Based Product Areas

### Super Admin
Global platform control:
- manage companies
- manage entities
- manage hierarchy
- manage users/roles/permissions
- monitor requests
- monitor assignments
- view reports/logs

### Senior
Company-level oversight:
- monitor company requests
- track managers/entities
- access scoped monitoring
- no normal request creation flow

### Manager
Entity/team management:
- track requests
- manage team-level visibility
- limited permission/user control based on rules

### Team Leader
Team supervision:
- monitor user/team requests
- manage limited lower-scope operations
- support queue work if in support/dev entity

### Production User
Operational requester:
- create request
- view own requests
- track progress
- comment

### Support Team User
Operational handler:
- incoming request queue
- request details
- assign to self
- update status
- comment
- resolve/close where allowed

### Development Team User
Operational handler similar to support:
- manage incoming targeted requests
- update progress
- comment
- assign/work/resolve based on scope

---

## 13. Navigation / Product Structure Context

The platform is not only an admin panel.
It includes multiple workspace experiences for different roles.

Navigation should be role-aware but structurally consistent.

Examples:
- admin sees organization / access / operations / monitoring
- prod user sees create request / my requests / tracking
- support/dev sees queue / assigned / tracking

---

## 14. UI Context
The product should feel like:
- a modern enterprise operations platform
- table-first where appropriate
- calm, structured, and professional
- not playful
- not generic SaaS template
- not concept-only UI

The design system direction is based on:
- fixed 280px structural sidebar
- tonal layering
- restrained borders
- clean hierarchy
- strong spacing rhythm
- mature enterprise visual language :contentReference[oaicite:2]{index=2} :contentReference[oaicite:3]{index=3}

---

## 15. Non-Negotiable Rules

Do not break these rules unless explicitly agreed by the team:

1. company isolation must remain strict
2. source entity must reflect logged-in user context
3. target entity must be support/dev in same company
4. prod users create requests; support/dev users receive/manage targeted requests
5. support/dev queues must be filtered by exact target entity
6. backend must enforce permissions and visibility
7. role hierarchy must be respected
8. UI should reuse shared patterns, not page-specific improvisation
9. sidebar width and structural layout must remain consistent
10. merged changes must not introduce duplicated page sections or inconsistent components

---

## 16. Source of Truth Priority
When there is uncertainty, follow this order:

1. agreed business rules in this file
2. DESIGN_RULES.md
3. AI_RULES.md
4. current stable implementation
5. team discussion before introducing a new pattern or business rule