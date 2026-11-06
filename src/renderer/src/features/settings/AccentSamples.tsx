/**
 * Muestras del degradado de acento para elegir la identidad visual.
 * Solo la opción A está aplicada (tokens.css); las otras son propuestas.
 * Cuando se elija una, se fija en los tokens y este componente desaparece.
 */
const samples = [
  { name: 'A · Violeta → Coral', from: '#6b3ff2', to: '#ff6b5b', current: true },
  { name: 'B · Índigo → Turquesa', from: '#4f46e5', to: '#14b8a6', current: false },
  { name: 'C · Magenta → Ámbar', from: '#c026d3', to: '#f59e0b', current: false },
  { name: 'D · Azul noche → Cian', from: '#1e3a8a', to: '#06b6d4', current: false }
]

export function AccentSamples(): React.JSX.Element {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Propuestas de acento">
      {samples.map((sample) => (
        <li key={sample.name} className="flex flex-col gap-2">
          <div
            aria-hidden
            className="h-16 rounded-md shadow-sm"
            style={{ backgroundImage: `linear-gradient(135deg, ${sample.from}, ${sample.to})` }}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium">{sample.name}</span>
            {sample.current && (
              <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent uppercase">
                Actual
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
