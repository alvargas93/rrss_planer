import { NavLink } from 'react-router'
import { cn } from '@renderer/lib/utils'
import { CURRENT_PHASE, footerNav, mainNav, type NavItem } from './navigation'

function SidebarLink({ item }: { item: NavItem }): React.JSX.Element {
  const Icon = item.icon
  const soon = item.phase > CURRENT_PHASE
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-md px-3 py-2 text-[15px] font-medium transition-base',
          'hover:bg-surface-2 hover:text-text',
          isActive ? 'bg-accent-soft text-accent' : 'text-muted'
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            aria-hidden
            className={cn(
              'absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent-gradient transition-base',
              isActive ? 'opacity-100' : 'opacity-0'
            )}
          />
          <Icon size={22} strokeWidth={1.75} aria-hidden className="shrink-0" />
          <span className="truncate">{item.label}</span>
          {soon && (
            <span className="ml-auto rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-subtle uppercase">
              Fase {item.phase}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

export function Sidebar(): React.JSX.Element {
  return (
    <aside
      className="flex w-[232px] shrink-0 flex-col border-r border-border bg-surface"
      aria-label="Navegación principal"
    >
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
        <div
          aria-hidden
          className="grid size-8 place-items-center rounded-md bg-accent-gradient text-accent-fg shadow-sm"
        >
          <span className="text-[15px] font-bold">C</span>
        </div>
        <span className="text-[17px] font-semibold tracking-tight">Cadencia</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3" aria-label="Secciones">
        {mainNav.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </nav>

      <nav className="flex flex-col gap-0.5 border-t border-border px-3 py-3" aria-label="Ajustes">
        {footerNav.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </nav>
    </aside>
  )
}
