## 1. Purpose
This file is the current design source of truth for the website.

It reflects what is actually implemented now in the frontend:
- React + Vite + Tailwind CSS v4
- shared layout shell
- shared buttons, cards, badges, inputs, and selects
- light and dark themes
- admin-first data-heavy pages

Goal:
- keep the product consistent
- document the real design system in use now
- prevent one-off styling
- guide future pages to match the existing app

---

## 2. Current Design Direction

The product no longer follows the older "brutal design" spec as a full-page rule.

What the UI is now:
- clean enterprise admin UI
- strong typography with restrained borders
- white or near-white surfaces in light mode
- dark slate surfaces in dark mode
- yellow primary action in light mode
- indigo/violet primary action in dark mode
- simple cards and tables with low-noise borders
- selective brutal accents on primary buttons and active sidebar items

Overall feel:
- structured
- readable
- admin-focused
- practical
- modern but not flashy

Avoid:
- inventing a new page style per screen
- mixing soft rounded SaaS cards with heavy brutal elements randomly
- adding decorative gradients or loud effects to data-heavy pages
- introducing role/page-specific color systems

---

## 3. Theme Tokens

All theme values come from `frontend/src/index.css`.

### Light Theme

#### Core colors
- `--background: 0 0% 100%`
- `--foreground: 217 43% 14%`
- `--card: 0 0% 100%`
- `--card-foreground: 217 43% 14%`

#### Surface layers
- `--surface-1: 0 0% 100%`
- `--surface-2: 225 10% 94%`
- `--surface-3: 221 15% 90%`

#### Brand / action colors
- `--primary: 47 99% 49%`
- `--primary-foreground: 217 38% 12%`
- `--primary-soft: 49 100% 90%`
- `--primary-glow: 47 100% 58%`

#### Support colors
- `--secondary: 217 14% 42%`
- `--secondary-foreground: 0 0% 100%`
- `--accent: 217 14% 42%`
- `--accent-foreground: 0 0% 100%`
- `--muted: 225 10% 92%`
- `--muted-foreground: 217 12% 42%`

#### Utility colors
- `--ink: 217 43% 14%`
- `--border: 221 21% 88%`
- `--input: 221 21% 88%`
- `--ring: 217 43% 14%`

#### Semantic colors
- `--destructive: 0 74% 63%`
- `--success: 142 60% 41%`
- `--warning: 32 95% 44%`
- `--info: 217 43% 20%`

#### Status colors
- `--status-new: 217 14% 40%`
- `--status-accepted: 217 43% 14%`
- `--status-progress: 32 95% 44%`
- `--status-rejected: 0 74% 63%`
- `--status-completed: 142 60% 41%`
- `--status-closed: 217 28% 22%`

#### Sidebar
- `--sidebar-background: 0 0% 100%`
- `--sidebar-foreground: 217 30% 20%`
- `--sidebar-primary: 47 99% 49%`
- `--sidebar-primary-foreground: 217 38% 12%`
- `--sidebar-accent: 49 100% 90%`
- `--sidebar-accent-foreground: 217 38% 12%`
- `--sidebar-border: 217 38% 12%`

### Dark Theme

#### Core colors
- `--background: 220 18% 13%`
- `--foreground: 55 18% 95%`
- `--card: 220 19% 15%`
- `--card-foreground: 55 18% 95%`

#### Surface layers
- `--surface-1: 220 19% 15%`
- `--surface-2: 220 19% 15%`
- `--surface-3: 220 18% 17%`

#### Brand / action colors
- `--primary: 247 74% 62%`
- `--primary-foreground: 0 0% 100%`
- `--primary-soft: 247 38% 28%`
- `--primary-glow: 247 78% 68%`

#### Utility colors
- `--ink: 0 0% 100%`
- `--border: 0 0% 100%`
- `--input: 0 0% 100%`
- `--ring: 247 74% 62%`

#### Sidebar
- `--sidebar-background: 222 20% 14%`
- `--sidebar-foreground: 210 20% 90%`
- `--sidebar-primary: 247 74% 62%`
- `--sidebar-primary-foreground: 0 0% 100%`
- `--sidebar-accent: 222 20% 20%`
- `--sidebar-accent-foreground: 55 18% 95%`
- `--sidebar-border: 0 0% 100%`

### Radius
- `--radius: 0.25rem`
- visual default is compact, not pill-shaped

---

## 4. Typography

### Font
- primary font: `Inter`
- app-wide font family: `--font-sans`

### Base text
- body font size is `17px`
- body text uses `text-foreground`
- body is antialiased with OpenType features enabled

### Heading behavior
- `h1`, `h2`, `h3`, `h4` use `font-extrabold tracking-tight`

### Shared title patterns
- eyebrow: `text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground`
- page title: `text-2xl sm:text-3xl font-extrabold uppercase tracking-tight`
- card title: `text-xl font-extrabold uppercase`
- description/body support text: `text-sm text-muted-foreground`

### Text style rules
- use uppercase for navigation labels, eyebrows, badges, and many action labels
- do not force uppercase for all body text
- prefer readable sentence case for descriptions and help text

---

## 5. Layout System

### App shell
The site uses a shared shell:
- fixed sidebar on desktop
- slide-out sidebar on mobile
- sticky top header
- centered content container

### Main content spacing
- page wrapper inside shell: `px-4 py-6 sm:px-6 lg:px-8`
- standard content width: `max-w-7xl`
- common page rhythm: `space-y-6`

### Standard page pattern
```jsx
<main className="page-content">
  <PageHeader ... />
  <div className="surface-card">...</div>
  <div className="surface-card">...</div>
</main>
```

### Page header
Use the shared `PageHeader` component.

Structure:
- eyebrow
- title
- description
- actions on the right
- optional meta row below

Rules:
- do not build custom intro blocks if `PageHeader` fits
- actions should align right on desktop and stack naturally on mobile

---

## 6. Component Rules

### 6.1 Buttons

Buttons still carry the strongest visual identity in the app.

Base:
- `brutal-press`
- `inline-flex items-center justify-center gap-2`
- `rounded-md`
- `border-2 border-ink`
- `text-sm font-bold`

Shared variants:
- `default`: yellow in light mode, violet in dark mode, `shadow-brutal`
- `outline`: white/card background, dark text, `shadow-brutal`
- `secondary`: secondary fill, `shadow-brutal`
- `destructive`: destructive fill, `shadow-brutal`
- `ghost`: no heavy border, no shadow
- `link`: link-like button, no heavy border

Sizes:
- `sm`: `h-9 px-3`
- `default`: `h-10 px-4 py-2`
- `lg`: `h-11 px-8`
- `icon`: `h-10 w-10`

Rules:
- use shared `Button` component
- primary actions should usually use default variant
- secondary actions should usually use `outline`
- avoid custom button color overrides unless matching an existing pattern

### 6.2 Cards

Cards are now cleaner than the old brutal spec.

Base card:
- `rounded-md`
- `border border-ink/10`
- `bg-card`
- `text-card-foreground`
- `shadow-none`

Shared sections:
- header: `border-b border-ink/10 p-6`
- content: `p-6`
- footer: `border-t border-ink/10 p-6`

Rules:
- prefer `surface-card` or shared `Card`
- do not add heavy shadows to normal data cards
- use stronger borders only where already established

### 6.3 Inputs

Base input:
- `h-10`
- `rounded-md`
- `border border-input`
- `bg-card`
- `px-3 py-2`
- `text-sm font-medium`
- `focus-visible:ring-1 focus-visible:ring-ring`

Rules:
- prefer standard height `h-10`
- keep placeholders muted
- avoid oversized form controls unless the page already uses them

### 6.4 Selects

Shared Radix-based select mirrors input sizing.

Trigger:
- `h-10`
- `rounded-md`
- `border border-input`
- `bg-card`
- `px-3 py-2`
- `text-sm font-medium`

Dropdown:
- compact menu
- border `border-ink/10`
- subtle shadow
- item focus uses accent background

### 6.5 Badges

Current badges are compact and light.

Base:
- `inline-flex items-center`
- `rounded-sm`
- `border border-ink/10`
- `px-2 py-0.5`
- `text-[10px] font-bold uppercase tracking-widest`

Use badges for:
- status
- role labels
- small metadata counts

Do not use badges for:
- long descriptive text
- large KPI cards

### 6.6 Tables

Tables are a major design pattern in the app.

Shared `.data-table`:
- `w-full`
- `border-separate border-spacing-0`
- left-aligned
- tabular numbers

Header:
- `bg-surface-2`
- `text-[11px]`
- `font-extrabold uppercase tracking-wider`
- muted foreground

Cells:
- `border-b border-ink/10`
- `bg-card`
- `px-4 py-3`
- `text-sm`

Hover:
- light mode: `bg-primary/15`
- dark mode: `bg-surface-2`

Rules:
- prefer `.data-table` for admin listings
- keep row density medium, not cramped
- sticky section headers are acceptable in permission matrices

### 6.7 Filter bars

Use `.filter-bar` for search and filtering rows.

Base:
- `flex flex-wrap items-center gap-3`
- `border-b border-ink/10`
- `bg-card`
- `p-4`

Rules:
- search first, filters after
- allow horizontal scrolling on narrower widths when needed

### 6.8 Sidebar

The sidebar is white in light mode and dark in dark mode.

Pattern:
- grouped navigation sections
- eyebrow-style group labels
- active item is highlighted strongly

Active nav item:
- `border-ink`
- `bg-primary`
- `text-primary-foreground`
- `shadow-elev-sm`

Inactive nav item:
- transparent border by default
- hover uses `bg-primary-soft`

Rules:
- use the shared nav config
- do not create page-local sidebar styles

---

## 7. Shadows and Visual Weight

The app currently mixes two styles:
- most surfaces are flat and clean
- buttons and active navigation keep the brutal pressed treatment

Available shadows:
- `shadow-brutal`
- `shadow-brutal-lg`
- `shadow-elev-sm`
- `shadow-elev-md`
- `shadow-elev-lg`
- `shadow-elev-xl`

Current rule:
- standard cards: no shadow
- primary/outline buttons: brutal shadow
- active nav items: small elevation shadow
- avoid soft blur-heavy shadows on regular admin content

---

## 8. Motion and Interaction

Defined animations:
- `animate-fade-in`
- accordion open/close
- caret blink

Current interaction patterns:
- page content fades in
- buttons use `brutal-press` on active press
- hover states are quick and minimal

Rules:
- keep motion short
- prioritize clarity over spectacle
- do not add decorative motion to tables/forms

---

## 9. Dark Mode Rules

Dark mode is a supported first-class theme.

Rules:
- use tokens, not hardcoded colors
- assume both light and dark mode must work
- dark mode tables should keep clear row separation
- dark backgrounds should not introduce gradients unless already defined
- hover backgrounds in dark mode should resolve to `surface-2`-style behavior

Before shipping UI:
- test card contrast
- test table hover state
- test muted text readability
- test primary buttons and badges

---

## 10. Common Patterns In Use

### Admin list page
- `PageHeader`
- action buttons on right
- `surface-card` with filter bar
- `data-table`

### Detail/edit page
- `PageHeader`
- one or two `surface-card` panels
- form sections separated by top borders or spacing
- permission tables/matrices on the side when needed

### Permission matrix
- compact rows
- section labels
- sticky subheaders when useful
- check/minus toggles instead of large switches

### Search in top bar
- compact input
- icon inside left
- floating results panel
- grouped results by entity type

---

## 11. What To Reuse First

Before creating anything new, check:
1. `PageHeader`
2. `Button`
3. `Card`
4. `Badge`
5. `Input`
6. `Select`
7. `.surface-card`
8. `.data-table`
9. `.filter-bar`
10. `AppShell` layout patterns

If one of these already solves the problem, use it.

---

## 12. Current Do / Don't

### Do
- use shared tokens from `index.css`
- keep pages clean and readable
- use yellow primary action in light mode through the shared button
- keep forms and tables aligned to shared spacing
- use compact uppercase metadata where the app already does
- keep cards simple and flat
- design for both light and dark themes

### Don't
- revive the old heavy brutal style for every card and section
- create one-off button variants for single pages unless necessary
- hardcode colors that break dark mode
- add heavy shadows to normal content panels
- replace table patterns with custom layouts without a clear reason
- duplicate custom page headers when shared `PageHeader` works

---

## 13. Consistency Checklist

Before merging UI work, verify:
- does it use shared theme tokens?
- does it work in light and dark mode?
- does it reuse shared components where possible?
- does the spacing match nearby pages?
- does the page look like it belongs beside Users, Roles, Requests, and Reports?
- are buttons using the standard visual language?
- are tables using the existing table pattern if the page is data-heavy?
- are descriptions readable and not over-stylized?

If not, fix it before merging.

---

## 14. Source of Truth

If design behavior is unclear, follow this order:
1. current shared component implementation
2. `frontend/src/index.css`
3. current high-traffic pages already in production style
4. this file
5. team discussion before introducing a new pattern

---

**Last Updated:** April 2026  
**Design System:** Current Website UI v2  
**Framework Stack:** React + Vite + Tailwind CSS v4 + Radix UI + Inter  
**Key Principle:** Clean enterprise UI with shared patterns, strong actions, and consistent theming.
