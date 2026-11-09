import { NETWORK_META, NETWORKS, type Network } from '@shared/connectors/networks'
import type { ActionKind, ScreenContext } from '@shared/domain/ai'

/**
 * Prompts del asistente. Funciones puras: reciben datos y devuelven texto,
 * así se pueden probar sin tocar la API.
 */

/** Parte estable del prompt de sistema (va primero para que la caché la aproveche). */
export const PERSONA = `Eres el asistente de RRSS Planner, una app de escritorio con la que una persona gestiona sus propias redes sociales: Instagram, LinkedIn, X y YouTube.

Tu trabajo: ayudar a tener ideas, escribir guiones con gancho, adaptar textos a cada red, sugerir hashtags y planificar la semana. Trabajas con el contenido de la persona que te habla; no inventes datos sobre su cuenta que no estén en el contexto.

Normas:
- Responde en español neutro, directo y sin relleno. Nada de "¡Claro!" ni resúmenes de lo que vas a hacer.
- Propón, no decidas: nunca publicas, programas ni borras nada. La persona siempre confirma en la app.
- Si falta información importante, pregunta una sola cosa concreta; si puedes trabajar con una suposición razonable, dila en una línea y sigue.
- Cuando escribas textos para publicar, escríbelos listos para copiar: sin comillas, sin etiquetas como "Gancho:", salvo que se pidan por separado.
- Respeta los límites de cada red (caracteres, formatos) que se indican en el contexto.`

const NETWORK_LIMITS = NETWORKS.map((n) => {
  const m = NETWORK_META[n]
  const extras = m.extraFields.map((f) => `${f.label} ≤ ${f.maxChars}`).join(', ')
  return `- ${m.label}: hasta ${m.maxChars} caracteres; formatos: ${m.kinds.join(', ')}${
    m.maxHashtags ? `; máx. ${m.maxHashtags} hashtags` : ''
  }${extras ? `; ${extras}` : ''}`
}).join('\n')

/** Describe el contexto de pantalla en texto llano para el modelo. */
export function describeContext(context: ScreenContext): string {
  const parts: string[] = []
  const screenLabel: Record<ScreenContext['screen'], string> = {
    dashboard: 'Inicio',
    ideas: 'Ideas',
    tasks: 'Tareas',
    calendar: 'Calendario',
    composer: 'Compositor de publicaciones',
    settings: 'Ajustes',
    assistant: 'Asistente',
    analytics: 'Analítica',
    video: 'Editor de vídeo',
    other: 'otra'
  }
  parts.push(`Pantalla actual: ${screenLabel[context.screen]}.`)
  if (context.pillars.length > 0)
    parts.push(`Pilares de contenido de la cuenta: ${context.pillars.join(', ')}.`)
  if (context.idea) {
    parts.push(
      `Idea en pantalla:\n  Título: ${context.idea.title}\n  Notas: ${context.idea.notes || '(sin notas)'}\n  Pilar: ${context.idea.pillar ?? 'sin pilar'}`
    )
  }
  if (context.post) {
    const variants = context.post.variants
      .map((v) => `    · ${NETWORK_META[v.network].label} (${v.kind}): ${v.text || '(vacío)'}`)
      .join('\n')
    parts.push(
      `Publicación en pantalla:\n  Título interno: ${context.post.title}\n  Texto base: ${context.post.body || '(vacío)'}\n  Pilar: ${context.post.pillar ?? 'sin pilar'}\n  Programada: ${context.post.scheduledAt ?? 'sin fecha'}\n  Versiones por red:\n${variants || '    (ninguna)'}`
    )
  }
  if (context.extra) parts.push(`Información adicional:\n${context.extra}`)
  return parts.join('\n\n')
}

export function buildSystemPrompt(context: ScreenContext): { stable: string; dynamic: string } {
  return {
    stable: `${PERSONA}\n\nLímites por red (orientativos):\n${NETWORK_LIMITS}`,
    dynamic: `Contexto de la app en este momento:\n\n${describeContext(context)}`
  }
}

/** Instrucción de usuario para cada acción estructurada. */
export function buildActionPrompt(
  kind: ActionKind,
  instruction: string,
  networks: Network[],
  context: ScreenContext
): string {
  const extra = instruction.trim() ? `\n\nIndicaciones de la persona: ${instruction.trim()}` : ''
  const source =
    context.post?.body || context.idea
      ? 'Parte del contenido que hay en pantalla.'
      : 'No hay contenido en pantalla: usa los pilares y las indicaciones.'

  switch (kind) {
    case 'ideas':
      return `Propón entre 6 y 10 ideas de contenido nuevas, variadas en formato y ángulo, pensadas para esta cuenta. ${source} Cada idea debe tener un gancho concreto (una primera frase real, no una descripción del gancho).${extra}`
    case 'script':
      return `Escribe un guion de vídeo corto (reel/short) a partir del contenido en pantalla: gancho de 3 segundos, desarrollo con ritmo y una llamada a la acción. Incluye rótulos cortos para pantalla y estima la duración al leerlo en voz alta. ${source}${extra}`
    case 'adapt': {
      const targets = (networks.length > 0 ? networks : [...NETWORKS]).map(
        (n) => NETWORK_META[n].label
      )
      return `Adapta el texto base en pantalla a estas redes: ${targets.join(', ')}. Para cada una, reescribe respetando su tono habitual y sus límites: en X sé breve y directo; en LinkedIn arranca con una primera línea fuerte y usa saltos de línea; en Instagram escribe un pie con los primeros 125 caracteres muy claros y hashtags al final; en YouTube escribe una descripción útil para búsqueda. Devuelve el texto listo para pegar. ${source}${extra}`
    }
    case 'hashtags':
      return `Sugiere entre 10 y 20 hashtags para el contenido en pantalla, ordenados de más a menos relevante, mezclando amplios y de nicho, sin genéricos vacíos (#love, #instagood). ${source}${extra}`
    case 'summary':
      return `Escribe un resumen semanal de rendimiento a partir de las métricas que hay en el contexto ("Información adicional"). Sé concreto: cifras, variaciones y qué publicaciones funcionaron. Si faltan métricas, dilo sin inventar. Termina con acciones realistas para la semana que viene.${extra}`
    case 'captions':
      return `Convierte el guion que hay en el contexto ("Información adicional") en subtítulos sincronizados para un vídeo de la duración indicada. Reglas: cada subtítulo de 1 a 4 segundos, máximo 42 caracteres, frases naturales sin cortar palabras, sin solapar tiempos, cubriendo toda la duración y respetando el ritmo del habla (unas 2,5 palabras por segundo). Devuelve solo los subtítulos.${extra}`
    case 'weekly_plan':
      return `Propón un plan de publicaciones para la semana que viene (lunes = día 0), entre 4 y 7 piezas, repartidas entre las redes y equilibrando los pilares de contenido. Cada pieza con red, formato, título y un esbozo de dos frases. Horas razonables en hora local. ${source}${extra}`
  }
}

/** Texto que se guarda como mensaje de usuario cuando se lanza una acción. */
export function describeActionRequest(kind: ActionKind, instruction: string): string {
  const labels: Record<ActionKind, string> = {
    ideas: 'Generar ideas',
    script: 'Escribir guion',
    adapt: 'Adaptar a cada red',
    hashtags: 'Sugerir hashtags',
    weekly_plan: 'Plan semanal',
    summary: 'Resumen de métricas',
    captions: 'Subtítulos desde el guion'
  }
  return instruction.trim() ? `${labels[kind]}: ${instruction.trim()}` : labels[kind]
}
