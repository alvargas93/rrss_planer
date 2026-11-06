# Plan del proyecto · Gestor de redes sociales de escritorio

> Versión 5 · 2026-11-06 · Fase 4 completada
> Estado: stack aprobado (Electron). Nombre de la app: **RRSS Planner** (confirmado).
> Acento: propuesta A (violeta → coral), confirmado.

Este documento es la especificación de referencia del proyecto (no existía `docs/PRD.md`,
así que el prompt inicial del propietario es la fuente y este plan lo desarrolla).
Cuando una decisión cambie, se actualiza aquí y se anota en `docs/decisions/`.

---

## 1. Qué construimos

Una app de escritorio (Windows primero, Mac con el mismo código) para gestionar redes
sociales de forma personal: organizar ideas y tareas, planificar un calendario de
publicaciones, redactar y adaptar contenido con ayuda de Claude, publicar y programar en
Instagram, LinkedIn, X y YouTube mediante sus APIs oficiales, y revisar métricas.

**v1 (personal):** todo en local, sin servidor ni cuentas de usuario.
**v2 (comercial, futuro):** mismo cliente + servidor. Por eso las capas se separan desde el
día uno (ver §4).

---

## 2. Stack propuesto y justificación

### 2.1 Electron frente a Tauri

Recomendación: **Electron**. Coincide con tu propuesta de partida.

| Criterio                                                          | Electron                                  | Tauri 2                                                              |
| ----------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------- |
| Lenguaje del "motor"                                              | TypeScript (uno solo en todo el proyecto) | Rust para el backend + TS para la interfaz                           |
| SQLite, FFmpeg, OAuth local, bandeja, notificaciones, auto-update | Librerías maduras, todo en npm            | Posible, pero gran parte en Rust o plugins menos maduros             |
| Cifrado de secretos con el SO                                     | `safeStorage` integrado                   | Plugin `stronghold` o keyring vía Rust                               |
| Peso del instalador                                               | ~90–150 MB                                | ~10–20 MB                                                            |
| Memoria en uso                                                    | Mayor (incluye Chromium)                  | Menor (usa el navegador del sistema)                                 |
| Consistencia visual Win/Mac                                       | Idéntica (mismo Chromium)                 | Depende del WebView del sistema (WebView2 en Windows, WebKit en Mac) |
| Riesgo para este proyecto                                         | Bajo                                      | Medio: dos lenguajes, más piezas que pueden fallar                   |

Por qué Electron para tu caso: no eres programador y vas a trabajar conmigo paso a paso.
Un solo lenguaje (TypeScript) en interfaz, lógica y acceso a datos reduce a la mitad las
cosas que hay que entender y depurar. Todo lo que la app necesita (base de datos local,
procesado de vídeo, servidor local para el OAuth, bandeja del sistema, actualizaciones)
tiene librerías probadas en el ecosistema Node. El coste es un instalador más pesado y más
RAM, que para una herramienta de productividad personal es aceptable.

Cuándo tendría sentido Tauri: si el peso del instalador o la memoria fueran críticos
(por ejemplo, distribuir a miles de usuarios con equipos modestos). Si en la v2 eso se
vuelve prioritario, la separación de capas de §4 permite reutilizar toda la interfaz
React y la lógica de dominio; solo habría que reescribir la capa de "servicios del
escritorio".

### 2.2 Stack completo

| Capa                  | Elección                                                                                     | Por qué                                                                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime de escritorio | **Electron** (última versión estable)                                                        | Ver arriba                                                                                                                                    |
| Herramienta de build  | **electron-vite**                                                                            | Configura Vite para los tres procesos de Electron (main, preload, renderer) con recarga en caliente. Evita configurar tres builds a mano      |
| Interfaz              | **React 19 + TypeScript (strict)**                                                           | Estándar del sector, enorme ecosistema de componentes accesibles                                                                              |
| Enrutado              | **React Router** (modo memoria, no hay URLs reales en escritorio)                            | Simple y conocido                                                                                                                             |
| Estilos               | **Tailwind CSS v4** con tokens en variables CSS                                              | Tema claro/oscuro y cambios de marca tocando una sola hoja                                                                                    |
| Componentes           | **shadcn/ui sobre Radix**                                                                    | Accesibles (teclado, lectores de pantalla), copian el código al proyecto (sin dependencia opaca)                                              |
| Iconos                | **Lucide React**                                                                             | Trazo uniforme, 20–24 px, como pediste                                                                                                        |
| Tipografía            | **Inter** (empaquetada en la app, sin cargar de internet)                                    | Libre, variable, pesos 400–700                                                                                                                |
| Estado de UI          | **Zustand** (estado local) + **TanStack Query** (datos que vienen del proceso principal)     | Ligeros; Query gestiona carga, caché y reintentos                                                                                             |
| Arrastrar y soltar    | **dnd-kit**                                                                                  | Accesible por teclado, funciona en tablero y calendario                                                                                       |
| Gráficos              | **Recharts**                                                                                 | Simple, responsive, tematizable con los tokens                                                                                                |
| Base de datos         | **SQLite** con **better-sqlite3** + **Drizzle ORM**                                          | Fichero único local, rápido, sin servidor. Drizzle da esquema tipado y migraciones versionadas; el mismo esquema sirve para Postgres en la v2 |
| Validación            | **Zod**                                                                                      | Valida todo lo que cruza la frontera entre interfaz y proceso principal, y las respuestas de las APIs externas                                |
| Secretos              | **`safeStorage` de Electron** → cifrado guardado en SQLite                                   | Usa DPAPI en Windows y Keychain en Mac. Nunca texto plano                                                                                     |
| IA                    | **`@anthropic-ai/sdk`** oficial                                                              | Streaming, tipos, reintentos. Modelo configurable en ajustes                                                                                  |
| Vídeo                 | **FFmpeg** empaquetado (`ffmpeg-static` + `ffprobe-static`) ejecutado como proceso hijo      | No depende de que el usuario tenga FFmpeg instalado                                                                                           |
| Programador           | Planificador propio en el proceso principal (comprobación cada minuto, persistido en SQLite) | Sin dependencias; sobrevive a reinicios de la app                                                                                             |
| Tests                 | **Vitest** (unitarios) + **Playwright** (extremo a extremo con Electron, desde Fase 2)       | Rápidos y con buen soporte de TypeScript                                                                                                      |
| Calidad               | **ESLint + Prettier**, `tsc --noEmit` antes de cada commit                                   | Mismo estilo en todo el código                                                                                                                |
| Empaquetado           | **electron-builder** (NSIS en Windows, DMG en Mac) + **electron-updater**                    | Instaladores y actualizaciones automáticas en Fase 8                                                                                          |

Versiones concretas se fijarán al instalar (Fase 1) consultando los registros oficiales
ese día; no se escriben aquí para no quedar obsoletas.

### 2.3 Modelo de Claude por defecto

Verificado contra la documentación de Anthropic a fecha de hoy (2026-11-06):

| Modelo            | Identificador       | Entrada / salida ($ por millón de tokens) | Uso recomendado en la app                                  |
| ----------------- | ------------------- | ----------------------------------------- | ---------------------------------------------------------- |
| Claude Opus 5.5   | `claude-opus-5-5`   | 4 / 20                                    | **Por defecto.** Guiones, adaptación por red, plan semanal |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | 2 / 10                                    | Alternativa más barata para tareas repetitivas             |
| Claude Haiku 5.5  | `claude-haiku-5-5`  | 0,10 / 0,50                               | Hashtags, resúmenes cortos, tareas masivas                 |

El identificador se guarda en ajustes y se puede cambiar; la app consultará el endpoint
de modelos de la API para ofrecer la lista actualizada. La tabla de precios también será
editable en ajustes para que la estimación de coste no dependa de una actualización de la app.

---

## 3. Estructura de carpetas

```
RRSS/
├─ CLAUDE.md                     Convenciones del proyecto (para mí y para quien colabore)
├─ README.md                     Cómo instalar y arrancar (se crea en Fase 1)
├─ docs/
│  ├─ PLAN.md                    Este documento
│  ├─ decisions/                 Decisiones de arquitectura (una por fichero, numeradas)
│  └─ connectors/                Resumen verificado de cada API antes de programarla
├─ package.json
├─ electron.vite.config.ts
├─ tsconfig.json  tsconfig.node.json  tsconfig.web.json
├─ electron-builder.yml
├─ resources/                    Iconos de la app, fuente Inter, binarios auxiliares
├─ drizzle/                      Migraciones SQL generadas y versionadas
├─ src/
│  ├─ shared/                    CÓDIGO PURO: sin Electron, sin Node, sin React
│  │  ├─ domain/                 Tipos y reglas de negocio (Post, Task, Account, Capability…)
│  │  ├─ contracts/              Contratos IPC tipados con Zod (petición/respuesta por canal)
│  │  ├─ connectors/             Interfaz `Connector` y tipos de capacidades
│  │  └─ utils/                  Fechas, formato, validaciones
│  ├─ main/                      PROCESO PRINCIPAL (Node): la "trastienda"
│  │  ├─ index.ts                Arranque, ventana, bandeja, ciclo de vida
│  │  ├─ ipc/                    Un registrador de handlers por módulo; valida con los contratos
│  │  ├─ db/                     Cliente SQLite, esquema Drizzle, ejecución de migraciones
│  │  ├─ repositories/           Acceso a datos por entidad (la única capa que habla SQL)
│  │  ├─ services/               Lógica de cada módulo: tasks, ideas, calendar, posts, scheduler,
│  │  │                          ai, video, analytics, settings, backup
│  │  ├─ connectors/             base/ (clase abstracta, OAuth loopback, reintentos, errores)
│  │  │                          instagram/  youtube/  linkedin/  x/  manual/ (notificación)
│  │  ├─ secrets/                Envoltorio de safeStorage
│  │  └─ notifications/          Notificaciones del sistema
│  ├─ preload/                   PUENTE seguro: expone `window.api` tipado; nada más
│  └─ renderer/                  INTERFAZ (React). index.html aquí; el código en renderer/src/
│     ├─ app/                    Router, proveedores (tema, query), layout con barra lateral
│     ├─ design/                 tokens.css (colores, radios, sombras), tipografía, animaciones
│     ├─ components/ui/          Componentes base (shadcn): Button, Dialog, Card, Skeleton…
│     ├─ components/             Componentes compartidos: AccountAvatar, FeedCard, EmptyState…
│     ├─ features/               Una carpeta por módulo, con sus pantallas, hooks y estado
│     │  ├─ dashboard/  tasks/  ideas/  calendar/  composer/  accounts/
│     │  ├─ assistant/  analytics/  video/  settings/
│     ├─ lib/                    Cliente IPC tipado, utilidades de UI
│     └─ main.tsx  index.html
└─ tests/
   ├─ unit/                      Vitest: dominio, servicios, conectores (con APIs simuladas)
   └─ e2e/                       Playwright + Electron: smoke.mjs lanza la app compilada
```

Regla de oro: **`src/shared` no importa nada de Electron, Node ni React.** Es lo que
en la v2 se moverá tal cual al servidor y al cliente.

---

## 4. Arquitectura por capas (y cómo encaja la v2)

```
┌──────────────────────── renderer (React) ────────────────────────┐
│  Pantallas → hooks (TanStack Query) → cliente IPC tipado          │
└───────────────────────────────┬──────────────────────────────────┘
                                │ window.api.<módulo>.<acción>(datos validados con Zod)
┌───────────────────────────────▼──────────────────────────────────┐
│  preload: expone solo los canales declarados en shared/contracts  │
└───────────────────────────────┬──────────────────────────────────┘
┌───────────────────────────────▼──────────────────────────────────┐
│  main/ipc: valida, llama al servicio, devuelve resultado o error  │
│  main/services: reglas de negocio por módulo                      │
│  main/connectors: una implementación por red con interfaz común   │
│  main/repositories: SQLite vía Drizzle                            │
│  main/secrets: safeStorage                                        │
└──────────────────────────────────────────────────────────────────┘
```

Cómo se añade un servidor en la v2 sin rehacer la app:

- La interfaz **solo conoce** `window.api` (contratos de `shared/contracts`). Si mañana esos
  contratos los sirve un servidor HTTP en vez del proceso principal, la interfaz no cambia.
- Los **servicios** reciben los repositorios por parámetro (inyección de dependencias). Se
  puede sustituir "repositorio SQLite local" por "repositorio remoto" sin tocar la lógica.
- Los **conectores** no saben dónde viven los tokens: piden a `secrets` y reciben el valor.
  En la v2, `secrets` puede ser una bóveda del servidor.
- El **esquema Drizzle** se migra a Postgres con cambios mínimos (mismo lenguaje de esquema).
- Toda entidad lleva `id` UUID, `created_at`, `updated_at` y `deleted_at` (borrado lógico)
  desde el principio, que es lo que hace falta para sincronizar entre dispositivos después.

### 4.1 Interfaz común de conector

Cada red implementa esta interfaz (en `shared/connectors/Connector.ts`); el resto de la
app no sabe qué red hay detrás:

```ts
interface Connector {
  readonly network: 'instagram' | 'linkedin' | 'x' | 'youtube' | 'manual';
  capabilities(): Capabilities;            // qué soporta: formatos, límites, métricas, programación nativa
  connect(): Promise<Account>;             // abre OAuth en el navegador del sistema, recibe el callback
  disconnect(accountId: string): Promise<void>;
  refreshAuth(accountId: string): Promise<void>;
  validate(post: PostVariant): ValidationResult;   // antes de publicar: longitud, formato, tamaño
  publish(accountId: string, post: PostVariant, media: Media[]): Promise<PublishResult>;
  schedule?(...): Promise<ScheduleResult>; // solo si la red lo permite de forma nativa
  fetchMetrics(accountId: string, range: DateRange): Promise<MetricsSnapshot[]>;
}
```

`Capabilities` es un objeto declarativo ("acepta vídeo hasta X MB", "máx. N caracteres",
"da impresiones: sí/no") que el compositor usa para avisar antes de publicar. Lo que una
red no permite por API cae al conector `manual`: notificación a la hora programada con el
texto y los archivos listos para copiar y publicar a mano.

### 4.2 Limitación de la publicación programada

El planificador vive dentro de la app. Si la app está cerrada, no publica. Mitigación en
v1: la app se minimiza a la bandeja del sistema en vez de cerrarse, opción de arrancar con
el sistema, y al abrir la app se ejecutan las publicaciones atrasadas (con aviso).
En la v2 el planificador se mueve al servidor y publica aunque el equipo esté apagado.

---

## 5. Modelo de datos

Convenciones: ids UUID v7 (texto), fechas ISO 8601 en UTC, `deleted_at` para borrado
lógico, JSON en columnas de texto para estructuras flexibles (validado con Zod).

| Tabla               | Para qué                                        | Campos principales                                                                                                                                                                                                |
| ------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `settings`          | Ajustes clave-valor                             | `key`, `value_json` (tema, modelo IA, límite mensual, precios, idioma)                                                                                                                                            |
| `secrets`           | Secretos cifrados                               | `key`, `ciphertext` (blob de safeStorage), `updated_at`. Nunca el valor en claro                                                                                                                                  |
| `accounts`          | Cuentas de redes conectadas                     | `network`, `external_id`, `username`, `display_name`, `avatar_path`, `account_type` (business, creator…), `status` (connected, expired, revoked), `scopes_json`, `token_expires_at`, `secret_key` → `secrets.key` |
| `content_pillars`   | Pilares de contenido                            | `name`, `description`, `color`, `sort_order`                                                                                                                                                                      |
| `ideas`             | Banco de ideas                                  | `title`, `notes`, `pillar_id`, `status` (inbox, maturing, ready, used, discarded), `source`, `tags_json`                                                                                                          |
| `tasks`             | Tareas (tablero y lista)                        | `title`, `description`, `status` (todo, doing, done), `priority`, `due_at`, `idea_id?`, `post_id?`, `sort_order`                                                                                                  |
| `posts`             | Publicación "madre" (un contenido)              | `title`, `body` (texto base), `pillar_id?`, `idea_id?`, `status` (draft, scheduled, publishing, published, partial, failed, cancelled), `scheduled_at?`, `notes`                                                  |
| `post_variants`     | Adaptación por red                              | `post_id`, `network`, `kind` (feed, carousel, reel, story, short, video, article, thread), `text`, `hashtags_json`, `extra_json` (título YouTube, visibilidad, alt-texts…)                                        |
| `post_targets`      | A qué cuenta va cada variante y su estado       | `post_id`, `variant_id`, `account_id`, `mode` (api, manual), `scheduled_at`, `status`, `external_post_id?`, `published_at?`, `last_error?`                                                                        |
| `media_assets`      | Archivos (imagen/vídeo)                         | `path`, `kind`, `mime`, `width`, `height`, `duration_ms`, `size_bytes`, `sha256`, `alt_text`, `derived_from?`                                                                                                     |
| `post_media`        | Relación variante ↔ medios con orden            | `variant_id`, `media_id`, `sort_order`                                                                                                                                                                            |
| `publish_jobs`      | Cola del planificador                           | `target_id`, `run_at`, `attempts`, `max_attempts`, `state` (pending, running, done, failed, cancelled), `last_error`, `locked_at`                                                                                 |
| `metrics_snapshots` | Métricas de cuenta y de publicación por fecha   | `account_id`, `target_id?`, `captured_at`, `metric` (followers, impressions, reach, likes…), `value`, `source`                                                                                                    |
| `ai_conversations`  | Hilos del asistente                             | `title`, `context_type` (idea, post, account, screen), `context_id?`                                                                                                                                              |
| `ai_messages`       | Mensajes del asistente                          | `conversation_id`, `role`, `content_json`, `model`, `input_tokens`, `output_tokens`, `cost_estimate`                                                                                                              |
| `ai_usage_monthly`  | Acumulado para el límite mensual                | `month` (YYYY-MM), `input_tokens`, `output_tokens`, `cost_estimate`                                                                                                                                               |
| `notifications`     | Historial de avisos                             | `kind`, `title`, `body`, `payload_json`, `read_at`, `target_id?`                                                                                                                                                  |
| `video_projects`    | Proyectos del editor (Fase 6)                   | `name`, `timeline_json`, `output_format`, `last_export_path`                                                                                                                                                      |
| `audit_log`         | Quién hizo qué (útil para depurar y para la v2) | `entity`, `entity_id`, `action`, `payload_json`, `at`                                                                                                                                                             |

Dónde viven los archivos: la base de datos y los medios se guardan en la carpeta de datos
del usuario (`%APPDATA%/<app>` en Windows, `~/Library/Application Support/<app>` en Mac).
Los medios se copian a `media/` dentro de esa carpeta (no se referencian rutas externas,
para que la copia de seguridad sea completa).

---

### 5.1 Desviaciones aplicadas en Fase 2

- **Medios por publicación, no por variante.** La tabla `post_media` enlaza `post_id` con
  `media_id`. Simplifica el compositor: se adjuntan los archivos una vez y todas las redes
  los usan. Si más adelante hace falta un medio distinto por red (p. ej. vertical para
  reels y horizontal para YouTube), se añadirá una tabla `variant_media` sin romper nada.
- **Pilares con borrado real** (no lógico): son pocos y las ideas y publicaciones que los
  usaban quedan "sin pilar" gracias a la clave foránea. El resto de entidades usa
  `deleted_at`.
- **Límites por red orientativos.** `src/shared/connectors/networks.ts` contiene
  caracteres máximos, formatos y proporciones de cada red solo para la vista previa y
  los contadores. Cada conector los sustituirá por sus capacidades verificadas (Fases 4 y 7).
- **Tabla `tasks`** añade `completed_at`; **`media_assets`** guarda `file_name` (nombre
  dentro de la carpeta de medios) en vez de una ruta absoluta, para que la copia de
  seguridad sea portable.

### 5.2 Decisiones aplicadas en Fase 3 (Claude)

- **SDK oficial `@anthropic-ai/sdk`** (v1.6) contra la API de Anthropic con la clave del
  usuario. Chat por streaming (`messages.stream`) y acciones con salida estructurada
  (`messages.parse` + esquema Zod), ambas en el espacio `beta` para poder activar el
  **reintento automático en otro modelo si Claude declina por seguridad**
  (`fallbacks: "default"`). Es un ajuste activado por defecto que se puede apagar.
- **Clave cifrada con `safeStorage`** en la tabla `secrets`; el proceso principal es el
  único que la ve. La interfaz solo recibe "hay clave" y sus 4 últimos caracteres.
- **Modelo y esfuerzo configurables**; por defecto `claude-opus-5-5` con esfuerzo medio.
  La lista de modelos se obtiene de la API al "Probar conexión".
- **Coste estimado localmente** con una tabla de precios editable (entrada, salida, caché).
  Cada llamada guarda tokens y coste en `ai_usage`; el **límite mensual** bloquea nuevas
  llamadas al alcanzarse y avisa al 80 %. Es una estimación: la factura real la fija Anthropic.
- **Contexto de pantalla**: cada página declara lo que ve el asistente (publicación abierta,
  idea, pilares). Va en un bloque de sistema separado del texto estable para que la caché
  de prompts pueda aprovechar la parte fija.
- **Acciones aplicables con confirmación**: los resultados (ideas, guion, adaptaciones,
  hashtags, plan semanal) traen botones que escriben en el compositor o crean ideas y
  borradores; crear los borradores del plan semanal pide confirmación. Claude nunca
  publica ni borra.
- Las acciones "subtítulos" y "resumen de métricas" se añaden en las Fases 6 y 5, cuando
  exista la fuente de datos.

### 5.3 Decisiones aplicadas en Fase 4 (Instagram)

Ficha completa verificada: `docs/connectors/instagram.md`.

- **Instagram API con Instagram Login** (sin página de Facebook). Acceso Standard con la
  cuenta propia añadida como cuenta de prueba en la app de Meta; sin App Review en v1.
- **Dos formas de conectar:** pegar el token de 60 días que genera el App Dashboard
  (camino principal) o Business Login (OAuth) con servidor local en el puerto 47821
  (experimental: Meta no documenta si acepta `http://localhost`). El token se guarda cifrado
  y se renueva solo cuando quedan menos de 10 días.
- **Alojamiento temporal de medios obligatorio:** Instagram descarga los archivos desde una
  URL pública y con Instagram Login no hay subida directa. Interfaz `MediaHost` con
  Cloudinary (plan gratuito, autenticación básica, se sube → publica → borra). Sin él, las
  publicaciones con archivos van en **modo manual**: aviso a la hora con el texto copiado.
- **Destinos de publicación (`post_targets`):** una fila por red y publicación, con cuenta
  asignada, modo (api/manual), estado, reintentos (2, 10 y 30 min, máximo 3) y enlace al
  resultado. El estado del post se deriva de sus destinos (publicada, parcial, fallida…).
- **Planificador** cada minuto dentro de la app; con la ventana cerrada sigue en la bandeja
  del sistema. Lo atrasado más de 24 h no se publica solo: se marca para revisión.
- **Validación previa** con las reglas verificadas de la red (JPEG, 8 MB, proporción 4:5 a
  1.91:1, vídeo 3 s–15 min, pies de 2200 caracteres y 30 hashtags). La conversión
  automática de PNG/WebP a JPEG queda para la Fase 6 (FFmpeg).
- **Confirmación explícita** antes de "Publicar ahora". Nada se publica sin pulsar el botón.

## 6. Diseño

- **Tokens** en `renderer/design/tokens.css`: `--color-bg`, `--color-surface`, `--color-text`,
  `--color-muted`, `--color-border`, `--color-accent-from`, `--color-accent-to`, `--radius-*`,
  `--shadow-*`, `--motion-*`. Dos conjuntos (claro/oscuro) via `data-theme`, con opción
  "seguir al sistema".
- **Acento propio:** degradado original (propuesta inicial: violeta profundo → coral cálido;
  se decide en Fase 1 con muestras). Sin colores ni logotipos de ninguna marca.
- **Patrones:** barra lateral con icono + texto; fila de avatares con anillo degradado para
  las cuentas conectadas; tarjetas de feed; compositor con vista previa por red (maqueta
  genérica que imita proporciones y recortes de cada formato sin copiar la interfaz real).
- **Movimiento:** transiciones de 150–250 ms, esqueletos de carga; todo desactivado si el
  sistema tiene "reducir movimiento".
- **Accesibilidad:** contraste AA comprobado en ambos temas, foco visible, navegación por
  teclado completa, `alt` obligatorio en imágenes al publicar (el compositor lo pide).

---

## 7. Integración de Claude

- Clave guardada cifrada con safeStorage; en desarrollo puede venir de `.env` (no se sube a git).
- **Panel de asistente** lateral, siempre disponible, que recibe el contexto de la pantalla
  (idea, guion, cuenta, métricas visibles) y lo envía como contexto del sistema.
- **Tareas** implementadas como "acciones" con prompt propio y salida estructurada
  (validada con Zod): ideas, guion (gancho / desarrollo / llamada a la acción), adaptar por
  red, hashtags, subtítulos, resumen de métricas, plan semanal.
- **Modelo configurable** en ajustes (lista desde la API, por defecto `claude-opus-5-5`).
- **Coste:** cada respuesta guarda tokens de entrada/salida; se multiplica por la tabla de
  precios editable; acumulado mensual visible; **límite mensual** configurable que bloquea
  nuevas llamadas al alcanzarse (con aviso al 80 %).
- **Confirmación obligatoria:** Claude propone, tú decides. Nada se publica, programa ni
  borra sin pulsar un botón. El asistente devuelve "sugerencias aplicables" que se insertan
  en el compositor solo al aceptarlas.
- **MCP para la v2:** tiene sentido exponer la base de datos de la app (ideas, calendario,
  métricas) como servidor MCP local para que puedas usar Claude Desktop o Claude Code
  contra tus datos. En la v1 no se implementa, pero la capa `services` ya es lo que un
  servidor MCP envolvería, así que el coste futuro es bajo.

---

## 8. Reglas de plataformas

- Solo APIs oficiales. Nada de scraping, automatización del navegador ni guardar contraseñas.
- **OAuth en escritorio:** se abre el navegador del sistema; la app levanta un servidor local
  efímero en `http://127.0.0.1:<puerto>/callback` para recibir el código; se usa PKCE donde
  la red lo soporte; el secreto de cliente (si la red lo exige) se guarda cifrado.
- Antes de programar cada conector se escribe `docs/connectors/<red>.md` con lo verificado
  ese día en la documentación oficial: qué se puede publicar, métricas, tipo de cuenta
  exigido, flujo de login, revisión de app, coste y límites. Si algo no está claro, se
  marca como "no confirmado" y te lo digo.
- Errores previstos con mensaje claro y reintento cuando tenga sentido: token caducado
  (reautenticar), límite de uso (esperar y reintentar con espera creciente), formato de vídeo
  no aceptado (ofrecer conversión con FFmpeg), archivo demasiado grande (ofrecer recompresión).

### 8.1 Lo que sé hoy de cada red (orientativo; se verifica en su fase)

Esto es un resumen de partida para que puedas ir preparando cuentas. **No es definitivo**:
las condiciones de estas APIs cambian con frecuencia y cada una se confirmará contra la
documentación oficial justo antes de programarla.

| Red              | Puntos clave a confirmar                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instagram (Meta) | Exige cuenta **profesional** (Business o Creator). Publicar imágenes, carruseles y reels por API suele estar disponible; **historias** por API históricamente limitadas o no disponibles para apps de terceros → probable modo manual. Requiere app en Meta for Developers y permisos que pueden necesitar **revisión de la app** para salir del modo desarrollo; para uso personal, el modo desarrollo con tu propia cuenta como tester puede bastar. Gratis. |
| YouTube (Google) | YouTube Data API v3: subir vídeos y Shorts, programar con `publishAt`, métricas vía YouTube Analytics API. Gratis con **cuota diaria** (una subida consume una parte grande). Proyecto en Google Cloud con pantalla de consentimiento OAuth; en modo "pruebas" los **tokens de actualización caducan a los 7 días**, lo que obliga a reconectar semanalmente o a publicar la pantalla de consentimiento.                                                       |
| LinkedIn         | Publicar en **perfil personal** suele ser autoservicio ("Share on LinkedIn"); publicar en **páginas de empresa** y leer analíticas requiere acceso a programas con aprobación. Métricas de posts personales por API: limitadas o no disponibles → se verificará. Gratis.                                                                                                                                                                                       |
| X                | La API es **de pago** por niveles; el nivel gratuito ha sido históricamente solo escritura con cupo bajo, y las métricas requieren niveles superiores. Hay que confirmar precios y cupos vigentes antes de la Fase 7; es la red con más probabilidad de acabar en modo manual si no quieres pagar.                                                                                                                                                             |

---

## 9. Plan detallado por fases

Al terminar cada fase: paro, te explico qué hice, cómo probarlo, qué decisiones necesitas
tomar, y hago un commit. No empiezo la siguiente sin tu confirmación.

| Fase                        | Entregable                                                                                                                                                                                                                             | Cómo lo probarás                                                                                             | Decisiones que te pediré                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **0 · Plan**                | Este documento, `CLAUDE.md`, repositorio git iniciado                                                                                                                                                                                  | Leer y aprobar                                                                                               | Stack; tema de color de partida; nombre de la app                                                        |
| **1 · Base**                | App que arranca con ventana, barra lateral, tema claro/oscuro/sistema, tokens, tipografía Inter, iconos Lucide, SQLite con migraciones, pantalla de Ajustes (tema, idioma, carpeta de datos), README con `npm install` / `npm run dev` | `npm run dev` abre la app; cambiar tema; cerrar y reabrir conserva ajustes; `npm test` pasa                  | Nombre definitivo; acento de color; qué secciones van en la barra lateral                                |
| **2 · Organización**        | Tareas (tablero kanban + lista), ideas y pilares, calendario mensual/semanal con arrastrar y soltar de borradores, compositor básico con vista previa genérica, gestión de medios locales                                              | Crear pilar → idea → tarea → borrador → arrastrarlo en el calendario; todo sin redes conectadas              | Estados de tareas e ideas; vista por defecto del calendario                                              |
| **3 · Claude**              | Ajustes de IA (clave cifrada, modelo, precios, límite mensual), panel de asistente con contexto, acciones: ideas, guion, adaptar por red, hashtags, plan semanal; contador de uso y coste                                              | Pegar tu clave; pedir un guion desde una idea; ver tokens y coste; alcanzar el límite y comprobar el bloqueo | Modelo por defecto; límite mensual inicial                                                               |
| **4 · Instagram**           | `docs/connectors/instagram.md` verificado; conectar cuenta por OAuth; publicar imagen, carrusel y reel; programar; modo manual para lo no soportado; manejo de errores                                                                 | Conectar tu cuenta profesional; publicar una imagen de prueba; programar a +2 min y verla salir              | Crear app en Meta (te guío); qué hacer con historias si no hay API                                       |
| **5 · Analítica**           | Recogida periódica de métricas, gráficos por cuenta y publicación, resumen semanal generado por Claude                                                                                                                                 | Ver gráficos tras 24–48 h de datos; pedir resumen semanal                                                    | Qué métricas priorizar en el panel                                                                       |
| **6 · Vídeo**               | Editor: recortar, unir, subtítulos (manuales y generados por Claude a partir de transcripción si hay fuente), formatos 9:16 / 1:1 / 16:9, exportar con FFmpeg                                                                          | Importar vídeo, recortar, exportar en 9:16 y publicarlo como reel                                            | Si queremos transcripción automática (servicio externo) o solo subtítulos manuales                       |
| **7 · Resto de conectores** | YouTube, LinkedIn, X, cada uno con su `docs/connectors/<red>.md`, en ese orden (de más a menos probable que funcione sin coste)                                                                                                        | Conectar cada cuenta y publicar una prueba                                                                   | Si pagar la API de X o dejarla en modo manual                                                            |
| **8 · Distribución**        | Instaladores Windows (NSIS) y Mac (DMG), actualizaciones automáticas, copia de seguridad/restauración de datos y medios, arranque con el sistema, bandeja                                                                              | Instalar desde el `.exe`; hacer copia; restaurarla en otra carpeta                                           | Dónde alojar actualizaciones (GitHub Releases es gratis); firma de código (coste anual en Windows y Mac) |

Estimación orientativa de sesiones de trabajo contigo: Fases 1–3 son las más largas de
interfaz; la 4 depende de la aprobación de Meta; la 8 depende de certificados.

---

## 10. Lo que necesitas preparar

Puedes ir haciéndolo en paralelo; nada bloquea las Fases 1–2.

**Para la Fase 3 (Claude)**

- [ ] Clave de API en https://console.anthropic.com → API Keys. Añade saldo o método de pago.
      No me la pegues en el chat: la introducirás en la pantalla de Ajustes de la app.

**Para la Fase 4 (Instagram)**

- [ ] Cuenta de Instagram **profesional** (Business o Creator). Se cambia en Ajustes → Tipo de cuenta.
- [ ] Cuenta en https://developers.facebook.com y una app nueva. Yo te diré el tipo de app y
      los productos que añadir cuando verifique la documentación en esa fase.
- [ ] Ten claro si quieres vincular una página de Facebook (algunos flujos lo exigen).

**Para la Fase 7**

- [ ] YouTube: proyecto en https://console.cloud.google.com, activar YouTube Data API v3 y
      YouTube Analytics API, crear credenciales OAuth de tipo "aplicación de escritorio".
- [ ] LinkedIn: app en https://www.linkedin.com/developers con una página de empresa
      asociada (LinkedIn lo exige para crear apps aunque publiques en tu perfil).
- [ ] X: cuenta en https://developer.x.com; decide si vas a pagar un nivel de API. Te daré
      precios y límites verificados antes de que decidas.

**Para la Fase 8**

- [ ] Cuenta de GitHub (alojar el código y las actualizaciones gratis).
- [ ] Opcional: certificado de firma de código para Windows y cuenta Apple Developer para
      Mac. Sin ellos la app funciona, pero el sistema mostrará avisos al instalar.

**En tu equipo (ya comprobado)**

- Node 20, npm y git: instalados. FFmpeg no hace falta instalarlo; irá dentro de la app.
- Para empaquetar la versión Mac hará falta un Mac (o un servicio de CI con macOS). El
  código es el mismo; solo el empaquetado final necesita el sistema de destino.

---

## 11. Riesgos conocidos

| Riesgo                                                | Impacto                                  | Mitigación                                                                                                 |
| ----------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Revisión de app de Meta lenta o denegada              | Retrasa la publicación real en Instagram | Modo desarrollo con tu cuenta como tester para uso personal; modo manual como respaldo                     |
| API de X de pago                                      | Sin publicación automática en X          | Modo manual (notificación + contenido listo)                                                               |
| Tokens de Google caducan a los 7 días en modo pruebas | Reconectar cada semana                   | Publicar la pantalla de consentimiento (sin verificación formal, solo para tu uso) o aceptar la reconexión |
| Historias de Instagram sin API de terceros            | No se programan automáticamente          | Modo manual                                                                                                |
| Compilación nativa de better-sqlite3                  | Puede fallar al instalar en algún equipo | Binarios precompilados; alternativa `sql.js` si hiciera falta                                              |
| App cerrada = no publica                              | Publicaciones perdidas                   | Bandeja, arranque con el sistema, recuperación de atrasadas; servidor en v2                                |
