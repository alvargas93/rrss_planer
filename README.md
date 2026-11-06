# Cadencia

App de escritorio (Windows y Mac) para gestionar redes sociales: ideas, tareas, calendario,
publicación en Instagram, LinkedIn, X y YouTube, métricas y un asistente con Claude.
Todos los datos se guardan en tu equipo.

Especificación y plan por fases: [docs/PLAN.md](docs/PLAN.md). Convenciones: [CLAUDE.md](CLAUDE.md).

## Requisitos

- Node.js 20 o superior y npm.
- Windows 10/11 o macOS. Para generar el instalador de Mac hace falta un Mac.

## Puesta en marcha

```bash
npm install
```

```bash
npm run dev
```

Se abre la app con recarga automática al editar el código. Pulsa `F12` para abrir las
herramientas de desarrollo.

## Comandos

| Comando                           | Qué hace                                                            |
| --------------------------------- | ------------------------------------------------------------------- |
| `npm run dev`                     | Arranca la app en modo desarrollo                                   |
| `npm run typecheck`               | Comprueba los tipos de TypeScript                                   |
| `npm run lint`                    | Revisa el estilo del código                                         |
| `npm test`                        | Ejecuta los tests unitarios                                         |
| `npm run db:generate`             | Genera una migración a partir de cambios en `src/main/db/schema.ts` |
| `npm run build`                   | Compila la app                                                      |
| `npm run build:win` / `build:mac` | Genera el instalador (Fase 8)                                       |

## Dónde están tus datos

En desarrollo: `%APPDATA%\Cadencia-dev\data` (Windows) o
`~/Library/Application Support/Cadencia-dev/data` (Mac).
En la app instalada, la misma ruta sin `-dev`. Ajustes → Datos → "Abrir carpeta" te lleva allí.

## Estructura

```
src/shared     tipos, contratos IPC y lógica pura (sin Electron ni React)
src/main       proceso principal: base de datos, servicios, conectores, IPC
src/preload    puente seguro entre interfaz y proceso principal
src/renderer   interfaz React (tokens de diseño, componentes, pantallas)
drizzle        migraciones SQL versionadas
tests/unit     tests con Vitest
docs           plan, decisiones y fichas de cada conector
```
