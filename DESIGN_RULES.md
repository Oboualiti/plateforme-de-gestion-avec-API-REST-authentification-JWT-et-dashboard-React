## 1. Purpose
This file defines the **BRUTAL DESIGN** visual and layout rules for the EMD platform UI.

**Design Philosophy:** Bold, Direct, High-Contrast, No-Nonsense

Goal: Keep the product:
- unified and confident
- bold and direct
- professional with personality
- scalable and consistent
- intentional and purposeful across all roles

These rules must be followed on all current and future pages:
- admin pages
- manager pages
- team leader pages
- production user pages
- support/dev pages
- auth pages

---

## 2. Design North Star - BRUTAL DESIGN

The UI must feel like a **bold, confident enterprise operations platform**.

**Brutal Design Definition:**
- Not soft or calm — direct and bold
- Not tonal layering — hard edges and clear visual boundaries
- Not subtle borders — 2px solid borders with presence
- Not whisper typography — UPPERCASE, BOLD, TRACKING, IMPACT
- Hard shadows — offset, physical, shadow-brutal style
- High contrast — saturation and visual weight matter
- Punchy and purposeful — every element has presence

Target qualities:
- bold and direct
- structured and intentional
- confident and purposeful
- high-clarity with visual impact
- product-like with personality
- professional without being stiff
- table-first where appropriate
- visually unified with punch

Avoid:
- soft, blurred shadows
- thin 1px borders everywhere
- tonal layering instead of hard edges
- lowercase headers or subtle text
- overly rounded designs
- generic template-looking pages
- wimpy colors or muted tones

---

## 3. Color System

### Primary Variables (CSS HSL-based)

#### Surface & Background
- \`--background:  228 65% 96%\` — Main app background
- \`--foreground:  228 10% 12%\` — Main text color
- \`--card:        228 68% 99%\` — Card surface
- \`--card-foreground: 228 10% 12%\` — Card text
- \`--surface-1:   228 32% 96%\` — Tonal layer 1
- \`--surface-2:   228 32% 90%\` — Tonal layer 2
- \`--surface-3:   228 32% 85%\` — Tonal layer 3

#### Primary Accent (Dominant Brand Color)
- \`--primary:     228 100% 50%\` — Bold primary action color
- \`--primary-foreground: 0 0% 100%\` — Text on primary
- \`--primary-soft: 228 50% 92%\` — Soft primary background
- \`--primary-glow: 228 100% 60%\` — Glow/hover state

#### Secondary & Support
- \`--secondary:   228 68% 92%\` — Secondary actions
- \`--secondary-foreground: 228 10% 12%\`
- \`--accent:      228 100% 50%\` — Accent highlights
- \`--accent-foreground: 0 0% 100%\`
- \`--muted:       228 18% 75%\` — Muted text
- \`--muted-foreground: 228 12% 45%\` — Muted foreground

#### Semantic Status Colors
- \`--destructive: 0   84% 60%\` — Red - Errors, delete
- \`--destructive-foreground: 0 0% 100%\`
- \`--success:     120 61% 47%\` — Green - Success
- \`--success-foreground: 0 0% 100%\`
- \`--warning:     38  92% 50%\` — Amber - Warning
- \`--warning-foreground: 0 0% 0%\`
- \`--info:        210 100% 50%\` — Blue - Info
- \`--info-foreground: 0 0% 100%\`

#### Request Status Colors (Specific)
- \`--status-new:       210 100% 50%\` — Blue - New
- \`--status-accepted:  120 61% 47%\` — Green - Accepted
- \`--status-progress:  38  92% 50%\` — Amber - In Progress
- \`--status-rejected:  0   84% 60%\` — Red - Rejected
- \`--status-completed: 120 61% 47%\` — Green - Completed
- \`--status-closed:    228 12% 45%\` — Gray - Closed

#### Sidebar
- \`--sidebar-background: 228 22% 10%\` — Dark sidebar
- \`--sidebar-foreground: 0 0% 95%\` — Light text
- \`--sidebar-primary:    228 100% 50%\` — Active state
- \`--sidebar-primary-foreground: 0 0% 100%\`
- \`--sidebar-accent:     228 100% 50%\` — Accent in sidebar
- \`--sidebar-accent-foreground: 0 0% 100%\`
- \`--sidebar-border:     228 10% 22%\` — Border in sidebar
- \`--sidebar-ring:       228 100% 60%\` — Focus ring

#### Utility
- \`--border:    228 32% 85%\` — Default borders
- \`--input:     228 68% 99%\` — Input field background
- \`--ring:      228 100% 50%\` — Focus ring color
- \`--ink:       228 10% 12%\` — Text / deep ink

---

## 4. Shadow System (BRUTAL)

All shadows are **hard, offset shadows** — not soft blur:

- \`--shadow-brutal:       4px 4px 0 0 hsl(var(--ink))\` — 4px hard offset
- \`--shadow-brutal-lg:    6px 6px 0 0 hsl(var(--ink))\` — 6px hard offset
- \`--shadow-elev-sm:      2px 2px 0 0 hsl(var(--ink))\` — 2px elevation
- \`--shadow-elev-md:      4px 4px 0 0 hsl(var(--ink))\` — 4px elevation
- \`--shadow-elev-lg:      6px 6px 0 0 hsl(var(--ink))\` — 6px elevation
- \`--shadow-elev-xl:      8px 8px 0 0 hsl(var(--ink))\` — 8px elevation
- \`--shadow-glow:         0 0 0 3px hsl(var(--ring))\` — Focus glow

**Rule:** Every UI element with shadow gets a **brutal offset shadow**, never blur.

---

## 5. Typography System

### Font Stack
- **Primary Font:** Inter (imported from Google Fonts)
- **Monospace:** JetBrains Mono (optional for code/data)

### Text Styles & Cases
- **UPPERCASE** — primary, buttons, labels, headers
- **Tracking-widest** — \`letter-spacing: 0.16em\`
- **Font-bold** — 700 weight for impact
- **Font-semibold** — 600 weight for secondary emphasis

### Hierarchy

| Element | Size | Weight | Case | Tracking | Line Height |
|---------|------|--------|------|----------|-------------|
| Page Title | 2xl | 900/800 | UPPERCASE | widest | 1.2 |
| Section Title | xl | 800 | UPPERCASE | widest | 1.2 |
| Card Title | lg | 800 | UPPERCASE | tight | 1.2 |
| Eyebrow | xs | 700 | UPPERCASE | widest | 1.3 |
| Body Text | sm | 400 | Normal | normal | 1.5 |
| Labels | xs | 600 | UPPERCASE | widest | 1.3 |
| Table Header | xs | 600 | UPPERCASE | wider | 1.3 |
| Badges | xs/11px | 600 | UPPERCASE | wider | 1.3 |

---

## 6. Border System (2px Hard Borders)

### Border Widths
- **Primary border:** \`border-2\` (2px solid)
- **Thin border:** \`border\` (1px solid)
- **No border:** \`border-0\` or \`border-transparent\`

### Border Color
- **Dark text/ink border:** \`border-ink\` (uses \`--ink\`)
- **Muted border:** \`border-border\` (uses \`--border\`)
- **Sidebar border:** \`border-sidebar-border\`

### Border Radius (Controlled, Not Playful)
- **Cards/buttons/modals:** \`rounded-md\` (8px)
- **Small elements:** \`rounded-md\` (8px)
- **Avoid:** Overly rounded designs, no 20px+ radius

---

## 7. Spacing System

**Strict Tailwind spacing scale** (4px base):
- \`4px\` (1 unit)
- \`8px\` (2 units)
- \`12px\` (3 units)
- \`16px\` (4 units)
- \`20px\` (5 units)
- \`24px\` (6 units)
- \`28px\` (7 units)
- \`32px\` (8 units)

### Default Values
- **Card padding:** \`p-6\` (24px)
- **Card header:** \`p-6\` with \`border-b-2 border-ink\`
- **Card footer:** \`p-6\` with \`border-t-2 border-ink\`
- **Section spacing:** \`gap-6\` (24px)
- **Related controls:** \`gap-2\` or \`gap-3\` (8-12px)
- **Label-to-field:** \`space-y-1.5\` (6px)

---

## 8. Component Specifications

### 8.1 Buttons

**Base Classes:**
\`\`\`
brutal-press
inline-flex items-center justify-center gap-2
whitespace-nowrap rounded-md
border-2 border-ink
text-sm font-bold
ring-offset-background
transition-colors
focus-visible:outline-none focus-visible:ring-2
\`\`\`

**Variants:**

| Variant | Background | Text | Shadow | Hover |
|---------|-----------|------|--------|-------|
| default | \`bg-primary\` | \`text-primary-foreground\` | \`shadow-brutal\` | \`bg-primary/90\` |
| destructive | \`bg-destructive\` | \`text-destructive-foreground\` | \`shadow-brutal\` | \`bg-destructive/90\` |
| outline | \`bg-card\` | \`text-foreground\` | \`shadow-brutal\` | \`bg-accent text-accent-foreground\` |
| secondary | \`bg-secondary\` | \`text-secondary-foreground\` | \`shadow-brutal\` | \`bg-secondary/90\` |
| ghost | \`border-transparent bg-transparent\` | \`text-foreground\` | \`shadow-none\` | \`bg-primary-soft\` |
| link | \`border-transparent bg-transparent\` | \`text-primary\` | \`shadow-none\` | \`underline\` |

**Sizes:**
- \`sm\`: \`h-9 rounded-md px-3\`
- \`default\`: \`h-10 px-4 py-2\`
- \`lg\`: \`h-11 rounded-md px-8\`
- \`icon\`: \`h-10 w-10\`

### 8.2 Cards

**Structure:**
\`\`\`
<Card>
  <CardHeader className="border-b-2 border-ink">
    <CardTitle>UPPERCASE TITLE</CardTitle>
    <CardDescription>Description text</CardDescription>
  </CardHeader>
  <CardContent>Content here</CardContent>
  <CardFooter className="border-t-2 border-ink">Actions</CardFooter>
</Card>
\`\`\`

**Classes:**
\`\`\`
rounded-md
border-2 border-ink
bg-card
text-card-foreground
shadow-brutal
\`\`\`

### 8.3 Inputs & Textareas

**Classes:**
\`\`\`
flex h-10 w-full
rounded-md
border border-input
bg-card px-3 py-2 text-sm font-medium
ring-offset-background
file:border-0 file:bg-transparent
file:text-sm file:font-medium
placeholder:text-muted-foreground
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
disabled:cursor-not-allowed disabled:opacity-50
\`\`\`

### 8.4 Select Dropdowns

- Use same height as inputs: \`h-10\`
- Use same border style: \`border border-input\`
- Padding: \`px-3 py-2 text-sm\`
- Background: \`bg-background\` or \`bg-card\`

### 8.5 Tables

**Header Row:**
\`\`\`
border-b border-border
bg-muted/30 text-xs
uppercase tracking-wider
text-muted-foreground font-medium
\`\`\`

**Body Rows:**
\`\`\`
border-b border-border
last:border-0
hover:bg-muted/10 transition-colors
px-4 py-3
\`\`\`

### 8.6 Badges

**Classes:**
\`\`\`
inline-flex items-center
rounded-md
text-xs font-bold uppercase tracking-wider
px-2.5 py-0.5
border-2 border-ink
shadow-elev-sm
\`\`\`

**Status Badge Colors:**
- \`bg-{status}-500 text-{status}-foreground\`
- Examples: \`bg-success text-success-foreground\`

### 8.7 Sidebar

- **Background:** \`bg-sidebar\`
- **Text:** \`text-sidebar-foreground\`
- **Borders:** \`border-b-2 border-sidebar-border\`, \`border-t-2 border-sidebar-border\`
- **Active State:** \`bg-primary text-primary-foreground border-2 border-ink shadow-elev-sm\`
- **Item Spacing:** \`space-y-0.5\` between nav items
- **Item Padding:** \`px-2.5 py-2\` per nav link

---

## 9. Page Structure

### Standard Page Shell
\`\`\`
<main className="space-y-6">
  <PageHeader title="..." description="..." actions={...} />

  {/* Filter/search bar */}
  <Card>
    {/* Filter controls */}
  </Card>

  {/* Main content */}
  <Card>
    {/* Data table or form */}
  </Card>
</main>
\`\`\`

### Page Header Components
- **Eyebrow:** \`text-xs font-bold uppercase tracking-widest text-muted-foreground\`
- **Title:** \`text-2xl font-black uppercase\`
- **Description:** \`text-sm text-muted-foreground\`
- **Actions:** Button group with spacing \`flex gap-2\`
- **Meta:** Status badges and scope info

---

## 10. Animation & Micro-interactions

\`\`\`
--animate-accordion-down: accordion-down 0.2s ease-out
--animate-accordion-up: accordion-up 0.2s ease-out
--animate-fade-in: fade-in 0.25s ease-out
--animate-caret-blink: caret-blink 1s steps(1, end) infinite
\`\`\`

**Usage:**
- Fade-in on load
- Slide animations for drawers
- Quick transitions on hover (no long delays)

---

## 11. Design Rules (BRUTAL DESIGN REQUIREMENTS)

### Do'''s
- ✅ Use \`border-2 border-ink\` on interactive elements
- ✅ Apply \`shadow-brutal\` or \`shadow-elev-md\` to cards/buttons
- ✅ Use UPPERCASE, BOLD, TRACKING text for emphasis
- ✅ Keep contrast high and saturation strong
- ✅ Use hard, offset shadows (never soft blur)
- ✅ Apply 2px borders for visual impact
- ✅ Make typography SCREAM with uppercase
- ✅ Use color with confidence and boldness

### Don'''ts
- ❌ Do NOT use soft, blurred shadows
- ❌ Do NOT use thin 1px borders everywhere
- ❌ Do NOT use lowercase body copy for headers
- ❌ Do NOT use tonal layering instead of borders
- ❌ Do NOT use overly rounded corners
- ❌ Do NOT use subtle colors and muted tones for main UI
- ❌ Do NOT use normal (non-uppercase) text for labels/buttons
- ❌ Do NOT make the UI "calm and soft"

---

## 12. Component Consistency

### Before creating a new UI pattern, check if an existing one already exists.

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

## 13. Consistency Checklist

Before merging any UI work, verify:

- ✅ Does every button have \`border-2 border-ink\` and \`shadow-brutal\`?
- ✅ Do all cards have \`border-2 border-ink\` and \`shadow-brutal\`?
- ✅ Is all text uppercase where it should be (headers, labels, buttons)?
- ✅ Are card headers/footers using \`border-b-2/border-t-2 border-ink\`?
- ✅ Is the page using consistent spacing (\`gap-6\`, \`space-y-6\`)?
- ✅ Do all inputs match height \`h-10\` with consistent borders?
- ✅ Are tables using consistent header and row styles?
- ✅ Do badges use UPPERCASE text with proper size/padding?
- ✅ Does the page feel BOLD and CONFIDENT (not soft)?
- ✅ Does it work correctly without requiring refresh?

If the answer is no, fix before merging.

---

## 14. Strict Don'''ts

Do not:
- ❌ Use soft, subtle shadows anywhere
- ❌ Use 1px borders instead of 2px on main elements
- ❌ Lowercase headers or button text
- ❌ Change border radius to overly rounded (>8px)
- ❌ Create page-specific one-off component styles
- ❌ Use muted/pale colors for primary UI
- ❌ Duplicate page headers or intro blocks
- ❌ Create inconsistent table styles
- ❌ Make sidebars or navigation look "soft"
- ❌ Merge UI that breaks the bold design system

---

## 15. Source of Truth

If a visual decision is unclear, follow this order:
1. Shared reusable component already used in app
2. This DESIGN_RULES.md (Brutal Design System)
3. Actual component files (Button.jsx, Card.jsx, etc.)
4. Team discussion before introducing a new pattern

---

**Last Updated:** April 2026  
**Design System:** BRUTAL DESIGN v1.0  
**Framework Stack:** React + Vite + Tailwind CSS v4 + Inter Font  
**Key Principle:** BOLD. DIRECT. NO APOLOGIES.
'@; Set-Content -Path DESIGN_RULES.md -Value $content -Encoding UTF8"