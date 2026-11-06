import { PageHeader } from '@renderer/components/PageHeader'
import { EmptyState } from '@renderer/components/EmptyState'
import type { NavItem } from '@renderer/app/navigation'

/** Pantalla provisional para secciones de fases futuras. */
export function PlaceholderPage({ item }: { item: NavItem }): React.JSX.Element {
  return (
    <>
      <PageHeader title={item.label} />
      <EmptyState
        icon={item.icon}
        title={`${item.label} llega en la Fase ${item.phase}`}
        description="Esta sección ya tiene su sitio en la navegación; su contenido se construye en la fase indicada."
      />
    </>
  )
}
