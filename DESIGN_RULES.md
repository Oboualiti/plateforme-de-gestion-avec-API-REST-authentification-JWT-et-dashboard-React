# DESIGN_RULES.md

## 1. Purpose
This file defines the visual and layout rules for the project UI.

Its goal is to keep the product:
- unified
- clean
- professional
- scalable
- consistent across all roles and pages

These rules must be followed on all current and future pages:
- admin pages
- manager pages
- team leader pages
- production user pages
- support/dev pages
- auth pages

---

## 2. Design North Star
The UI must feel like a **modern enterprise operations platform**.

Target qualities:
- clean
- structured
- calm
- practical
- mature
- high-clarity
- product-like, not mockup-like
- professional, not playful
- table-first where needed
- visually unified across modules

Avoid:
- childish styling
- random card designs
- over-decorated dashboards
- repeated page blocks
- inconsistent spacing
- inconsistent component sizing
- AI-generated “concept” feeling
- generic template-looking pages

---

## 3. Layout Rules

### 3.1 Sidebar
- Sidebar width is fixed at **280px**
- Sidebar is part of the structural layout and must not change width
- Sidebar should use grouped navigation
- Use collapsible/accordion sections only in a restrained and professional way
- Nested links must be visually subtle and aligned
- Do not use bubbly, toy-like, or overly rounded navigation patterns
- Sidebar must feel serious and product-grade

### 3.2 Main Content Area
Each page must follow one consistent shell:

1. top workspace/header row
2. one main page header
3. optional subtitle
4. toolbar/filter/actions if needed
5. main content sections

Do not repeat:
- page title
- section intro
- “overview” block
- same description text multiple times

Each page should have **one clear header**, not stacked duplicates.

### 3.3 Spacing
Use a strict **8px spacing rhythm**:
- 8
- 16
- 24
- 32
- 40
- 48

Never use random spacing values.

Default content spacing:
- card padding: **24px**
- space between major sections: **24px or 32px**
- space between related controls: **16px**
- space between label and field: **8px**

---

## 4. Surface and Container Rules

### 4.1 Tonal Layering
Use tonal layering instead of heavy borders.

Surface hierarchy:
- App background = soft neutral base
- Section/container background = slightly elevated tone
- Cards/tables/forms = clean focused surface

### 4.2 No-Line Rule
Do not use unnecessary 1px borders to separate everything.
Prefer:
- spacing
- tonal shifts
- grouping
- alignment

Use borders only when truly needed.

### 4.3 Ghost Border
If a border is required:
- keep it subtle
- low opacity
- use it to support structure, not dominate it

---

## 5. Typography Rules

### 5.1 General Principle
Typography must feel like a real product, not a poster.

Use:
- strong but controlled headings
- clean readable body text
- consistent label sizing
- clear table typography

Do not use:
- oversized dramatic headings on normal pages
- too many display-style headings
- inconsistent label/body/title sizes

### 5.2 Hierarchy
Recommended structure:
- Page title = strong, clean, prominent
- Section title = clearly smaller than page title
- Subtext = muted and concise
- Labels = small, readable, consistent
- Table headers = compact and structured

### 5.3 Font Roles
- Display/headlines: use the heading font consistently
- Body/UI text: use the UI font consistently
- Do not mix styles randomly across pages

---

## 6. Component Rules

### 6.1 Cards
All cards must follow one shared style:
- same radius
- same padding
- same surface treatment
- same heading spacing
- same internal rhythm

Cards are for:
- summaries
- forms
- tables
- detail sections
- metadata blocks

Cards should feel functional, not decorative.

### 6.2 Buttons
Button hierarchy must be consistent:
- Primary
- Secondary
- Ghost / subtle
- Destructive only when needed

Rules:
- same height across the app
- same radius family
- same font sizing
- same hover/focus behavior

Do not create page-specific button styles unless necessary.

### 6.3 Inputs and Selects
All form controls must share:
- same height
- same padding
- same radius
- same border/focus logic
- same label spacing

Use:
- labels above fields
- clear validation
- consistent field grouping

### 6.4 Tables
All management/data pages must use one shared table pattern.

Tables should have:
- consistent row height
- consistent header style
- clear column alignment
- restrained hover states
- consistent badge size inside rows
- consistent action cell/button pattern

Pages that must follow this:
- Companies
- Entities
- Users
- Permissions
- Requests
- Assignments
- Logs
- Reports

### 6.5 Badges
Use a consistent badge system for:
- request statuses
- entity types
- user states
- role tags

Badges must not vary wildly in:
- size
- radius
- font
- padding

### 6.6 Search / Toolbar
Search bars and filter rows must follow one shared pattern:
- same input sizing
- same spacing
- same alignment
- same relationship to tables/cards below

---

## 7. Page Patterns

### 7.1 Dashboard Pages
Dashboards must be practical and operational.

Do:
- show key metrics
- show relevant summaries
- show recent activity
- show queue / status visibility
- keep structure clean

Do not:
- overuse hero blocks
- stack decorative cards without purpose
- repeat intro text
- make dashboard feel like a landing page

### 7.2 Management Pages
For pages like Companies, Entities, Users, Permissions:
- one page header
- one action/toolbar area if needed
- one main content area
- one unified table/form system

### 7.3 Detail Pages
For request/user/entity details:
- top summary header
- metadata section
- content split into logical areas
- timeline/comments/actions if relevant

Detail pages must be easy to scan.

### 7.4 Request Pages
Request-related pages must follow consistent structure:
- list pages = queue/table-first
- detail pages = summary + discussion + actions
- create pages = focused and simple

---

## 8. Navigation Rules

### 8.1 Grouping
Main sidebar groups:
- Platform
- Organization
- Access Control
- Operations
- Monitoring

Role-based variants may hide some sections, but the pattern must remain consistent.

### 8.2 Accordion / Collapsible Behavior
Accordion sections must:
- open cleanly
- not shift layout unpredictably
- use subtle active styling
- avoid decorative oversized triggers
- keep nested items aligned

### 8.3 Active State
Active states must be:
- clear
- restrained
- professional
- consistent across all sections

---

## 9. Role-Based Consistency
Different roles can see different pages, but the product must still feel unified.

That means:
- same page shell
- same spacing system
- same form controls
- same table patterns
- same typography rules
- same visual hierarchy

Do not invent a new design language per role.

---

## 10. Reuse Rules
Before creating a new UI pattern, check if an existing one already exists.

Always prefer:
- shared layout components
- shared page header
- shared table wrapper
- shared form section
- shared card styles
- shared toolbar/search pattern
- shared badge system

Do not create one-off versions of:
- headers
- cards
- tables
- sidebars
- search bars
- buttons
- inputs

---

## 11. Consistency Checklist
Before merging any UI work, verify:

- Is the page using the standard shell?
- Is the sidebar still aligned and consistent?
- Is the spacing based on the 8px rhythm?
- Are card paddings consistent?
- Are input/button heights consistent?
- Is the page header duplicated?
- Are tables following the shared pattern?
- Are badges/status indicators consistent?
- Does the page feel like the same product?
- Does it work correctly without requiring refresh?

If the answer is no, fix before merging.

---

## 12. Strict Don’ts
Do not:
- change sidebar width
- add random spacing values
- duplicate page intros
- create decorative hero sections for normal admin pages
- invent new button/input/card styles per page
- use heavy borders everywhere
- make the sidebar look playful
- create inconsistent table styles
- push AI-generated mockup styling into production pages
- merge UI that breaks consistency

---

## 13. Source of Truth
If a visual decision is unclear, follow this order:
1. shared reusable component already used in app
2. this DESIGN_RULES.md
3. project design system document
4. team discussion before introducing a new pattern