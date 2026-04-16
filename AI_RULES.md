# AI_RULES.md

## 1. Purpose
This file defines how AI tools should be used in this project.

Its goal is to prevent:
- inconsistent UI
- random refactors
- duplicated logic
- broken hierarchy rules
- backend/frontend mismatch
- unnecessary model/migration changes

AI must help extend the project, not fragment it.

---

## 2. General AI Behavior
AI must:
- inspect existing code first
- understand the current structure before changing anything
- reuse existing patterns where possible
- make minimal, scoped changes
- preserve consistency across pages/modules
- explain what was changed
- avoid unnecessary rewrites

AI must NOT:
- invent new business rules
- redesign unrelated pages
- change the stack
- create duplicate components/pages/apis
- break layout consistency
- create migrations unless model changes are intentional

---

## 3. Tech Stack Rules
Frontend:
- React
- Vite
- Tailwind
- shadcn/ui style components/patterns

Backend:
- Django
- Django REST Framework
- JWT auth
- PostgreSQL

Do not introduce a new framework/library unless explicitly requested.

---

## 4. Project Structure Rules
- Respect the current repo structure
- Do not move files unnecessarily
- Do not create duplicate folders/modules for the same feature
- Reuse existing layout/components/hooks/apis if they already solve the problem

---

## 5. UI Rules
AI must follow `DESIGN_RULES.md`.

That means:
- use shared layout patterns
- use shared card/table/form structure
- keep sidebar consistent
- keep 8px spacing rhythm
- avoid duplicated page headers/overview blocks
- avoid page-specific one-off styling
- keep interface product-like and professional

Before changing UI, AI should ask:
- does this already exist as a reusable pattern?
- can I extend an existing component instead?
- does this page still match the rest of the product?

---

## 6. Role and Hierarchy Rules
System roles include:
- Super Admin
- Senior
- Manager
- Team Leader
- User

AI must not:
- invent new roles
- break hierarchy rules
- allow lower roles to perform higher-level actions
- ignore reporting scope

Hierarchy and permission logic must be respected in both frontend and backend.

---

## 7. Company / Entity Rules
Companies like WMN / CMH / VMS are strictly separated.

AI must not:
- expose cross-company data to normal users
- allow target teams from another company
- break entity-type business logic

Entity types include:
- prod / production
- support
- dev / development

Requests and visibility must respect entity type and company scope.

---

## 8. Request Flow Rules
AI must preserve this logic unless explicitly asked to change it:

- prod-side users create requests
- source entity comes from logged-in user
- target entity must be support/dev in same company
- support/dev users only see requests targeted to their exact entity
- request lifecycle must remain traceable
- comments/history/status updates must remain consistent

Do not invent alternate workflows unless requested.

---

## 9. Permissions Rules
AI must preserve:
- role-based permissions
- user-specific overrides
- delegation rules
- hierarchy-based permission editing

Backend must always be the source of truth.

Do not rely only on frontend hiding.

Do not expose all permissions to lower roles.

---

## 10. Backend Rules
AI must:
- validate important business logic in backend
- reuse serializers/views/services where possible
- avoid duplicate endpoints
- keep API behavior consistent
- explain model changes if any are needed

AI must not:
- create migrations casually
- rename DB fields/tables without explicit need
- silently break compatibility

---

## 11. Frontend Rules
AI must:
- keep client-side navigation stable
- ensure pages work without manual refresh
- fix route/render bugs properly
- reuse shared components
- avoid page-by-page styling drift

AI must not:
- hardcode fake data for final logic
- patch UI in inconsistent ways
- add duplicated page blocks just to “fill” a screen

---

## 12. Merge Safety Rules
Before completing any AI-generated change, verify:
- page still follows design rules
- no duplicated headers/sections were introduced
- no route broke after navigation
- no component sizes became inconsistent
- no company/role/permission rule was weakened
- no unrelated files were changed without reason

---

## 13. Prompting Rules for the Team
When asking AI to do work, always specify:
- which page/module is affected
- which roles are involved
- whether backend validation is required
- whether DB changes are allowed
- what business rules must remain unchanged
- whether the change is UI-only or full-stack

Good prompts should mention:
- page name
- target role
- company/entity restrictions
- permission scope
- existing component/layout to reuse

---

## 14. Preferred AI Workflow
AI should follow this order:

1. inspect current implementation
2. identify minimum necessary changes
3. reuse existing patterns/components
4. apply backend validation if business logic is involved
5. apply frontend/UI changes
6. verify consistency with DESIGN_RULES.md
7. summarize changes clearly

---

## 15. Hard Don’ts
Do not:
- change stack
- create random new patterns
- bypass backend validation
- break company isolation
- break role hierarchy
- expose unauthorized requests/permissions
- add inconsistent UI
- generate migrations without need
- refactor unrelated modules “for cleanliness”

---

## 16. Source of Truth Order
When AI is unsure, follow this order:
1. current existing reusable project pattern
2. DESIGN_RULES.md
3. project business rules
4. direct user instruction
5. team discussion before introducing a new pattern