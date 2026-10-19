import { NavLink, Outlet } from 'react-router-dom'
import type { ReactNode } from 'react'

export interface SectionLink { to: string; label: string; end?: boolean }

/** URL-backed sections: refresh, bookmarks and browser history work naturally. */
export default function SectionLayout({ title, description, sections, actions }: {
  title: string; description: string; sections: readonly SectionLink[]; actions?: ReactNode
}) {
  return <div className="workspace-page">
    <header className="page-header workspace-header">
      <div><h1>{title}</h1><p>{description}</p></div>{actions}
    </header>
    <nav className="section-navigation" aria-label={`Sezioni ${title}`}>
      {sections.map(section => <NavLink key={section.to} to={section.to} end={section.end}
        className={({ isActive }) => isActive ? 'section-link active' : 'section-link'}>{section.label}</NavLink>)}
    </nav>
    <div className="workspace-content"><Outlet /></div>
  </div>
}
