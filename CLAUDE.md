# CLAUDE.md · Convenciones del proyecto

App de escritorio (Electron + React + TypeScript) para gestionar redes sociales.
Especificación de referencia: `docs/PLAN.md`. Decisiones de arquitectura: `docs/decisions/`.

## Cómo trabajamos

- El propietario **no es programador**. Explica cada decisión importante en lenguaje
  sencillo y di siempre cómo probar lo hecho. Evita jerga sin explicarla la primera vez.
- Trabajo **por fases** (ver `docs/PLAN.md` §9). Al terminar una fase: parar, explicar qué
  se hizo, cómo probarlo y qué decisiones hacen falta. **No empezar la siguiente fase sin
  confirmación explícita.**
- Si algo falla o no se puede hacer, decirlo claramente. Nunca simular una funcionalidad
  ni dejar código que "parece" funcionar sin probarlo.
- Idioma: la interfaz, la documentación y los mensajes al usuario en **español**. Los
  identificadores del código (variables, funciones, tablas, ficheros) en **inglés**.
- Antes de programar un conector de red: leer la documentación oficial vigente y escribir
  `docs/connectors/<red>.md` con lo verificado (publicación, métricas, tipo de cuenta,
  OAuth, revisión de app, coste, límites). No suponer capacidades.

## Arquitectura (resumen; detalle en `docs/PLAN.md` §3–4)

- `src/shared/`: código puro. **Prohibido** importar Electron, Node o React aquí.
- `src/main/`: proceso principal. Capas: `ipc` → `services` → `repositories` → SQLite.
  Los conectores en `main/connectors/<red>/` implementan `shared/connectors/Connector`.
- `src/preload/`: expone `window.api` tipado. Solo canales declarados en `shared/contracts`.
- `src/renderer/`: React. Organizado por `features/<módulo>/`. Solo habla con `window.api`.
- Toda frontera (IPC, respuestas de APIs externas, salidas de Claude) se valida con **Zod**.
- Entidades con `id` UUID, `created_at`, `updated_at`, `deleted_at` (borrado lógico).

## Reglas duras

- **Ningún secreto** en código, en git ni en logs. Claves y tokens solo cifrados con
  `safeStorage` (tabla `secrets`). En desarrollo, `.env` (ignorado por git).
- **Solo APIs oficiales.** Nada de scraping, automatización de navegador ni contraseñas de redes.
- **Claude nunca publica, programa ni borra** sin que el usuario pulse un botón de confirmación.
- El nombre del modelo de Claude **no va fijo en el código**: se lee de ajustes
  (`settings.ai.model`, por defecto `claude-opus-5-5`). La tabla de precios también es un ajuste.
- Sin colores, logotipos ni nombres de marcas de redes sociales en la interfaz.
- Accesibilidad: contraste AA, foco visible, navegación por teclado, `alt` en imágenes,
  respetar `prefers-reduced-motion`.

## Código

- TypeScript **strict** en los tres procesos. Sin `any` salvo justificación en comentario.
- Componentes de UI base en `renderer/components/ui/` (shadcn). Tokens de diseño solo en
  `renderer/design/tokens.css`; nunca colores literales en componentes.
- Iconos: `lucide-react`, tamaño 20 o 24, `strokeWidth` 1.75.
- Estado remoto (datos del proceso principal) con TanStack Query; estado local de UI con Zustand.
- Errores: los servicios lanzan `AppError` con `code` tipado; `ipc` los serializa; la
  interfaz muestra mensajes claros y, si procede, acción de reintento.
- Logs con niveles; nunca registrar tokens, claves ni cuerpos de peticiones con secretos.

## Tests y verificación

- Unitarios con **Vitest** en `tests/unit/` para dominio, servicios, planificador y
  conectores (APIs simuladas). Los tests corren en Node, no en Electron: better-sqlite3
  está compilado para Electron, así que los servicios se prueban con repositorios en
  memoria y la base de datos real se cubre con la prueba de humo.
- Prueba de humo `npm run smoke` (tras `npm run build`): lanza la app con Playwright,
  navega, cambia el tema, comprueba persistencia y guarda capturas en `tmp/smoke/`.
- Antes de cada commit: `npm run typecheck`, `npm run lint`, `npm test` deben pasar.
- Al cerrar una fase: también `npm run build` y `npm run smoke`.
- Al entregar una fase, incluir en el mensaje al usuario los pasos manuales de prueba.

## Git

- Commits en español, imperativo, con prefijo de fase: `fase1: añade sistema de tokens y tema oscuro`.
- Un commit al cerrar cada fase como mínimo; commits intermedios cuando un bloque funcione.
- No se suben: `node_modules/`, `out/`, `dist/`, `.env*`, bases de datos locales, medios.

## Comandos

- `npm install` · instalar dependencias (descarga Electron y compila better-sqlite3)
- `npm run dev` · arrancar en desarrollo con recarga
- `npm run typecheck` · comprobar tipos
- `npm run lint` · estilo (`npm run format` arregla el formato)
- `npm test` · tests unitarios
- `npm run db:generate` · generar migración tras cambiar `src/main/db/schema.ts`
- `npm run build` · compilar a `out/`
- `npm run smoke` · prueba de humo sobre la app compilada
- `npm run build:win` / `build:mac` · instaladores (Fase 8)

## Integración con Claude (Fase 3)

- Todo el código que habla con la API vive en `src/main/ai/`. La interfaz nunca ve la clave.
- Los prompts están en `src/main/ai/prompts.ts` como funciones puras con tests.
- Nuevas acciones: añadir el `kind` y su esquema Zod en `src/shared/domain/ai.ts`, el
  prompt en `prompts.ts` y la tarjeta de resultado en `features/ai/ActionResultCard.tsx`.
- Las pruebas del servicio usan un cliente falso (`tests/unit/ai.test.ts`); no se llama a
  la API real en tests ni en la prueba de humo.

## Conectores (Fase 4+)

- Cada red implementa `Connector` (`src/shared/connectors/Connector.ts`) en
  `src/main/connectors/<red>/` y se registra en `connectors/registry.ts`.
- Antes de programar un conector: ficha verificada en `docs/connectors/<red>.md` con fecha.
- Las capacidades (`capabilities()`) son la única fuente de verdad para validar antes de
  publicar; no se duplican límites en la interfaz.
- Los tokens van en `secrets` (safeStorage) con clave `account.<red>.<id externo>`; el
  renderer nunca recibe tokens ni secretos de apps.
- Publicar pasa siempre por `PublishingService` (destinos, reintentos, modo manual,
  alojamiento temporal con `MediaHost`). Los tests usan dobles; nunca llaman a las APIs.

## Notas de entorno

- En Windows, el alias `python` de la Microsoft Store se cuelga: no usarlo en scripts.
- `npm install` de paquetes nuevos puede fallar con "edgesOut" (bug de npm 10.8 con
  vitest); reintentar con `--legacy-peer-deps`.
- Datos de desarrollo en `%APPDATA%\RRSS Planner-dev\data`; la app instalada usa `RRSS Planner`.
