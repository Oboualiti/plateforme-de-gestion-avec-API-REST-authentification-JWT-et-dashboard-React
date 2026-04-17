import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'


function matchesPath(pathname, item) {
  return (item.matchPaths || []).some((matchPath) =>
    matchPath.endsWith('/')
      ? pathname.startsWith(matchPath)
      : pathname === matchPath || pathname.startsWith(`${matchPath}/`),
  )
}

function getAutoOpenSections(pathname, sections) {
  return sections
    .filter((section) => section.items.some((item) => matchesPath(pathname, item)))
    .map((section) => section.key)
}

function getSectionIcon(icon) {
  const commonProps = {
    fill: 'none',
    height: 16,
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 1.8,
    viewBox: '0 0 24 24',
    width: 16,
  }

  switch (icon) {
    case 'org':
      return (
        <svg {...commonProps}>
          <path d="M12 4v5" />
          <path d="M6 10h12" />
          <path d="M6 20v-4" />
          <path d="M12 20v-4" />
          <path d="M18 20v-4" />
          <rect x="9" y="2.5" width="6" height="3.5" rx="1" />
          <rect x="3" y="14" width="6" height="4" rx="1" />
          <rect x="9" y="14" width="6" height="4" rx="1" />
          <rect x="15" y="14" width="6" height="4" rx="1" />
        </svg>
      )
    case 'lock':
      return (
        <svg {...commonProps}>
          <rect x="5" y="10" width="14" height="10" rx="2" />
          <path d="M8 10V8a4 4 0 1 1 8 0v2" />
        </svg>
      )
    case 'ops':
      return (
        <svg {...commonProps}>
          <path d="M4 7h16" />
          <path d="M4 12h10" />
          <path d="M4 17h7" />
          <circle cx="17" cy="12" r="3" />
        </svg>
      )
    case 'monitor':
      return (
        <svg {...commonProps}>
          <path d="M4 18h16" />
          <path d="M7 18V9" />
          <path d="M12 18V5" />
          <path d="M17 18v-7" />
        </svg>
      )
    case 'team':
      return (
        <svg {...commonProps}>
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="10" r="2.5" />
          <path d="M4.5 19a5 5 0 0 1 9 0" />
          <path d="M14 18a4 4 0 0 1 6 0" />
        </svg>
      )
    case 'assign':
      return (
        <svg {...commonProps}>
          <path d="M4 12h9" />
          <path d="m10 8 4 4-4 4" />
          <rect x="15" y="5" width="5" height="14" rx="1.5" />
        </svg>
      )
    case 'track':
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l3 2" />
        </svg>
      )
    case 'queue':
      return (
        <svg {...commonProps}>
          <rect x="4" y="5" width="16" height="3.5" rx="1" />
          <rect x="4" y="10.25" width="12" height="3.5" rx="1" />
          <rect x="4" y="15.5" width="9" height="3.5" rx="1" />
        </svg>
      )
    case 'home':
    default:
      return (
        <svg {...commonProps}>
          <path d="M4 11.5 12 5l8 6.5" />
          <path d="M6.5 10.5V19h11v-8.5" />
        </svg>
      )
  }
}

export function Accordion({ children, className = '' }) {
  return <div className={`sidebar-accordion ${className}`.trim()}>{children}</div>
}

export function AccordionItem({ children, value }) {
  return (
    <section className="sidebar-accordion-item" data-accordion-item={value}>
      {children}
    </section>
  )
}

export function AccordionTrigger({ children, icon, isOpen, onClick }) {
  return (
    <button
      type="button"
      className={`sidebar-trigger ${isOpen ? 'sidebar-trigger-open' : ''}`}
      aria-expanded={isOpen}
      onClick={onClick}
    >
      <span className="sidebar-trigger-copy">
        <span className="sidebar-trigger-icon">{getSectionIcon(icon)}</span>
        <span>{children}</span>
      </span>
      <span className={`sidebar-trigger-chevron ${isOpen ? 'sidebar-trigger-chevron-open' : ''}`}>
        <svg fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="16">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </button>
  )
}

export function AccordionContent({ children, isOpen }) {
  return (
    <div className={`sidebar-content-shell ${isOpen ? 'sidebar-content-shell-open' : ''}`}>
      <div className="sidebar-content">{children}</div>
    </div>
  )
}

function SidebarAccordion({ sections }) {
  const location = useLocation()
  const autoOpenSections = useMemo(
    () => getAutoOpenSections(location.pathname, sections),
    [location.pathname, sections],
  )
  const [openSections, setOpenSections] = useState(autoOpenSections)

  useEffect(() => {
    setOpenSections((current) => {
      const next = new Set(current)
      autoOpenSections.forEach((key) => next.add(key))
      return Array.from(next)
    })
  }, [autoOpenSections])

  function toggleSection(sectionKey) {
    setOpenSections((current) =>
      current.includes(sectionKey)
        ? current.filter((key) => key !== sectionKey)
        : current.concat(sectionKey),
    )
  }

  return (
    <Accordion>
      {sections.map((section) => {
        const isOpen = openSections.includes(section.key)
        return (
          <AccordionItem key={section.key} value={section.key}>
            <AccordionTrigger
              icon={section.icon}
              isOpen={isOpen}
              onClick={() => toggleSection(section.key)}
            >
              {section.label}
            </AccordionTrigger>
            <AccordionContent isOpen={isOpen}>
              <div className="sidebar-subnav">
                {section.items.map((item) => (
                  <NavLink
                    key={`${section.key}-${item.label}-${item.to}`}
                    to={item.to}
                    className={({ isActive }) =>
                      isActive || matchesPath(location.pathname, item)
                        ? 'sidebar-subitem sidebar-subitem-active'
                        : 'sidebar-subitem'
                    }
                  >
                    <span className="sidebar-subitem-dot" />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )
      })}
    </Accordion>
  )
}

export default SidebarAccordion
