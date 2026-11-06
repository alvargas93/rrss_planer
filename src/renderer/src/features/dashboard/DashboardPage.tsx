import { Link } from 'react-router'
import { ArrowRight, CheckCircle2, Circle, Settings } from 'lucide-react'
import { PageHeader } from '@renderer/components/PageHeader'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { CURRENT_PHASE } from '@renderer/app/navigation'
import { cn } from '@renderer/lib/utils'

const phases = [
  { n: 1, title: 'Base', text: 'Esqueleto, diseño, navegación, base de datos y ajustes.' },
  {
    n: 2,
    title: 'Organización',
    text: 'Tareas, ideas, pilares y calendario con arrastrar y soltar.'
  },
  { n: 3, title: 'Claude', text: 'Asistente con contexto, guiones y adaptación por red.' },
  { n: 4, title: 'Instagram', text: 'Primer conector: conectar, publicar y programar.' },
  { n: 5, title: 'Analítica', text: 'Métricas, gráficos y resumen semanal.' },
  { n: 6, title: 'Vídeo', text: 'Recortar, unir, subtítulos y exportar en 9:16, 1:1 y 16:9.' },
  { n: 7, title: 'Más redes', text: 'YouTube, LinkedIn y X.' },
  { n: 8, title: 'Distribución', text: 'Instaladores, actualizaciones y copias de seguridad.' }
]

export function DashboardPage(): React.JSX.Element {
  return (
    <>
      <PageHeader
        title="Inicio"
        description="RRSS Planner es tu centro de mando para redes sociales. Por ahora, la base está lista: la organización llega en la siguiente fase."
      />

      <section className="mb-6 overflow-hidden rounded-xl bg-accent-gradient p-8 text-white shadow-md animate-in fade-in-0 slide-in-from-bottom-2">
        <p className="text-sm/5 font-medium opacity-90">Fase {CURRENT_PHASE} completada</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">La base está en pie</h2>
        <p className="mt-2 max-w-xl text-sm/6 opacity-90">
          Tema claro y oscuro, tipografía Inter, navegación por teclado, base de datos local con
          migraciones y una pantalla de ajustes que recuerda tus preferencias.
        </p>
        <Button
          asChild
          variant="secondary"
          className="mt-5 bg-white/15 text-white hover:bg-white/25"
        >
          <Link to="/settings">
            <Settings aria-hidden />
            Ir a Ajustes
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Hoja de ruta</CardTitle>
          <CardDescription>
            Qué hay y qué viene. Cada fase se entrega y se prueba antes de la siguiente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3 sm:grid-cols-2">
            {phases.map((phase) => {
              const done = phase.n <= CURRENT_PHASE
              const Icon = done ? CheckCircle2 : Circle
              return (
                <li
                  key={phase.n}
                  className={cn(
                    'flex gap-3 rounded-md border border-border p-3 transition-base',
                    done ? 'bg-accent-soft/60' : 'bg-surface'
                  )}
                >
                  <Icon
                    size={20}
                    strokeWidth={1.75}
                    aria-hidden
                    className={cn('mt-0.5 shrink-0', done ? 'text-accent' : 'text-subtle')}
                  />
                  <div>
                    <p className="text-sm font-semibold">
                      <span className="text-subtle">Fase {phase.n} · </span>
                      {phase.title}
                    </p>
                    <p className="text-xs text-muted">{phase.text}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        </CardContent>
      </Card>
    </>
  )
}
