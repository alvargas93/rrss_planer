import {
  BarChart3,
  CalendarDays,
  Clapperboard,
  LayoutDashboard,
  Lightbulb,
  ListTodo,
  ScanSearch,
  Settings,
  Sparkles,
  SquarePen,
  Users,
  type LucideIcon
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Fase en la que se implementa; si es mayor que la actual, se muestra "pronto". */
  phase: number
}

export const CURRENT_PHASE = 9

export const mainNav: NavItem[] = [
  { to: '/', label: 'Inicio', icon: LayoutDashboard, phase: 1 },
  { to: '/analysis', label: 'Análisis', icon: ScanSearch, phase: 9 },
  { to: '/tasks', label: 'Tareas', icon: ListTodo, phase: 2 },
  { to: '/ideas', label: 'Ideas', icon: Lightbulb, phase: 2 },
  { to: '/calendar', label: 'Calendario', icon: CalendarDays, phase: 2 },
  { to: '/compose', label: 'Crear', icon: SquarePen, phase: 2 },
  { to: '/accounts', label: 'Cuentas', icon: Users, phase: 4 },
  { to: '/analytics', label: 'Analítica', icon: BarChart3, phase: 5 },
  { to: '/video', label: 'Vídeo', icon: Clapperboard, phase: 6 },
  { to: '/assistant', label: 'Asistente', icon: Sparkles, phase: 3 }
]

export const footerNav: NavItem[] = [
  { to: '/settings', label: 'Ajustes', icon: Settings, phase: 1 }
]
