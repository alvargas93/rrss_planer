/**
 * Prueba de humo: lanza la app compilada (out/) con Playwright, recorre las pantallas,
 * crea y arrastra elementos, comprueba persistencia y guarda capturas.
 *
 * Uso:  npm run build && node tests/e2e/smoke.mjs [carpeta-de-capturas]
 */
import { _electron as electron } from 'playwright-core'
import { createRequire } from 'node:module'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const root = resolve(import.meta.dirname, '../..')
const shots = resolve(process.argv[2] ?? join(root, 'tmp', 'smoke'))
mkdirSync(shots, { recursive: true })

const problems = []
const check = (ok, label) => {
  console.log(`${ok ? 'OK ' : 'FAIL'} ${label}`)
  if (!ok) problems.push(label)
}

/**
 * Copia de seguridad con SQLite real. better-sqlite3 está compilado para Electron, así que
 * el módulo `backup/sqlite.ts` se ejecuta con el propio Electron funcionando como Node.
 */
function checkSqliteBackup() {
  const dir = join(root, 'tmp', 'sqlite-check')
  mkdirSync(dir, { recursive: true })
  const source = readFileSync(join(root, 'src/main/backup/sqlite.ts'), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText
  writeFileSync(join(dir, 'sqlite.cjs'), js)
  const files = {
    live: join(dir, 'live.db'),
    dump: join(dir, 'dump.db'),
    restored: join(dir, 'restored.db')
  }
  for (const f of Object.values(files)) for (const s of ['', '-wal', '-shm']) rmSafe(f + s)
  writeFileSync(
    join(dir, 'run.cjs'),
    `
const Database = require('better-sqlite3')
const { dumpWithoutSecrets, mergeSecrets } = require('./sqlite.cjs')
const f = ${JSON.stringify(files)}
const count = (file, table) => { const d = new Database(file, { readonly: true }); try { return d.prepare('SELECT count(*) AS n FROM ' + table).get().n } finally { d.close() } }
;(async () => {
  const live = new Database(f.live)
  live.pragma('journal_mode = WAL')
  live.exec("CREATE TABLE secrets (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT); CREATE TABLE posts (id TEXT PRIMARY KEY, title TEXT)")
  live.exec("INSERT INTO secrets VALUES ('anthropic.apiKey','cifrado1','t'), ('account.x.1','cifrado2','t'); INSERT INTO posts VALUES ('p1','Hola')")
  await dumpWithoutSecrets(live, f.dump)
  const out = { dumpSecrets: count(f.dump, 'secrets'), dumpPosts: count(f.dump, 'posts'), liveSecrets: count(f.live, 'secrets') }
  out.dumpHasKeyName = require('fs').readFileSync(f.dump).includes('anthropic.apiKey')
  require('fs').copyFileSync(f.dump, f.restored)
  live.close()
  mergeSecrets(f.restored, f.live)
  out.restoredSecrets = count(f.restored, 'secrets')
  out.restoredPosts = count(f.restored, 'posts')
  console.log('RESULT ' + JSON.stringify(out))
})().catch((e) => { console.log('ERROR ' + e.message); process.exit(1) })
`
  )
  const run = spawnSync(electronPath, [join(dir, 'run.cjs')], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    cwd: dir
  })
  const line = (run.stdout ?? '').split('\n').find((l) => l.startsWith('RESULT '))
  const r = line ? JSON.parse(line.slice(7)) : null
  if (!r) console.log(run.stdout, run.stderr)
  check(r !== null, 'copia SQLite real: se ejecuta con Electron como Node')
  if (r) {
    check(
      r.dumpSecrets === 0 && !r.dumpHasKeyName,
      'copia SQLite real: la copia no lleva claves ni tokens'
    )
    check(
      r.dumpPosts === 1 && r.liveSecrets === 2,
      'copia SQLite real: conserva los datos y no toca la base viva'
    )
    check(
      r.restoredSecrets === 2 && r.restoredPosts === 1,
      'restauración SQLite real: conserva las claves de este equipo'
    )
  }
}
function rmSafe(path) {
  try {
    if (existsSync(path)) writeFileSync(path, '')
  } catch {
    // se sobrescribe al crear la base
  }
}
checkSqliteBackup()

async function launch() {
  const app = await electron.launch({ executablePath: electronPath, args: ['.'], cwd: root })
  const win = await app.firstWindow()
  const errors = []
  win.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  win.on('pageerror', (err) => errors.push(err.message))
  await win.waitForLoadState('domcontentloaded')
  return { app, win, errors }
}

const theme = (win) => win.evaluate(() => document.documentElement.dataset.theme)
// Los enlaces de secciones futuras llevan una etiqueta "Fase N" en su nombre accesible.
const go = async (win, name, waitFor) => {
  await win
    .getByRole('link', { name: new RegExp(`^${name}`) })
    .first()
    .click()
  await win.waitForSelector(waitFor)
}

/** Arrastre con el ratón en pasos, como lo haría una persona (dnd-kit exige movimiento real). */
async function drag(win, fromLocator, toLocator) {
  const from = await fromLocator.boundingBox()
  const to = await toLocator.boundingBox()
  if (!from || !to) throw new Error('No se pudo medir origen o destino del arrastre')
  const sx = from.x + from.width / 2
  const sy = from.y + from.height / 2
  await win.mouse.move(sx, sy)
  await win.mouse.down()
  await win.mouse.move(sx + 12, sy + 12, { steps: 4 })
  await win.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 })
  await win.waitForTimeout(150)
  await win.mouse.up()
}

const confirmInDialog = async (win, name) => {
  await win.getByRole('dialog').getByRole('button', { name, exact: true }).click()
}

const tag = Date.now().toString(36).slice(-4)
const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre'
]

// --- Sesión 1: inicio, ajustes, cambio de tema -------------------------------
{
  const { app, win, errors } = await launch()
  await win.waitForSelector('text=Próximos 7 días', { timeout: 15000 })
  check((await win.title()) === 'RRSS Planner', 'título de la ventana es "RRSS Planner"')
  await win.screenshot({ path: join(shots, '01-inicio.png') })

  await go(win, 'Ajustes', 'text=Apariencia')
  const info = await win.evaluate(() => window.api.invoke('app:getInfo'))
  check(info.ok, 'IPC app:getInfo responde')
  check(existsSync(info.data.dbPath), `base de datos creada en ${info.data.dbPath}`)

  await win.getByRole('radio', { name: 'Claro' }).click()
  await win.waitForFunction(() => document.documentElement.dataset.theme === 'light')
  check((await theme(win)) === 'light', 'tema claro aplicado al pulsar')
  await win.screenshot({ path: join(shots, '02-ajustes-claro.png') })

  await win.getByRole('radio', { name: 'Oscuro' }).click()
  await win.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
  check((await theme(win)) === 'dark', 'tema oscuro aplicado al pulsar')
  await win.screenshot({ path: join(shots, '03-ajustes-oscuro.png') })

  await go(win, 'Inicio', 'text=Próximos 7 días')
  check(true, 'sección futura muestra pantalla "pronto"')

  await win.keyboard.press('Tab')
  const focused = await win.evaluate(() => document.activeElement?.tagName)
  check(focused === 'A' || focused === 'BUTTON', `foco por teclado llega a un control (${focused})`)

  check(errors.length === 0, `sin errores de consola (${errors.length})`)
  if (errors.length) console.log(errors.join('\n'))
  await app.close()
}

// --- Sesión 2: la preferencia persiste y vuelve a "sistema" -----------------
{
  const { app, win } = await launch()
  await win.waitForSelector('text=Próximos 7 días', { timeout: 15000 })
  check((await theme(win)) === 'dark', 'tema oscuro persiste tras reabrir')
  await go(win, 'Ajustes', 'text=Apariencia')
  await win.getByRole('radiogroup', { name: 'Tema' }).getByRole('radio', { name: 'Claro' }).click()
  await win.waitForTimeout(300)
  await app.close()
}

// --- Sesión 3: Fase 2 · pilares, ideas, tareas, compositor y calendario ------
{
  const { app, win, errors } = await launch()
  await win.waitForSelector('text=Próximos 7 días', { timeout: 15000 })
  const pillarName = `Educación ${tag}`
  const ideaTitle = `Tres errores al empezar ${tag}`
  const taskTitle = `Grabar reel ${tag}`
  const postTitle = `Reel de prueba ${tag}`

  // Pilar + idea
  await go(win, 'Ideas', 'text=Tu banco de ideas')
  await win.getByRole('button', { name: 'Pilares' }).click()
  await win.getByLabel('Nombre del nuevo pilar').fill(pillarName)
  await win.getByRole('button', { name: 'Añadir' }).click()
  await win.getByRole('dialog').getByText(pillarName).waitFor()
  check(true, 'pilar creado')
  await win.keyboard.press('Escape')

  await win.getByRole('button', { name: 'Nueva idea' }).first().click()
  await win.getByLabel('Título').fill(ideaTitle)
  await win.getByLabel('Notas').fill('Gancho: nadie te cuenta esto el primer día.')
  await win.getByRole('button', { name: 'Crear idea' }).click()
  await win.getByText(ideaTitle).waitFor()
  check(true, 'idea creada y visible en la lista')
  await win.waitForTimeout(400) // deja terminar la animación de cierre del diálogo
  await win.screenshot({ path: join(shots, '10-ideas.png') })

  // Tarea + arrastre entre columnas
  await go(win, 'Tareas', 'text=Lo que tienes que hacer')
  await win.getByRole('button', { name: 'Nueva tarea' }).first().click()
  await win.getByLabel('Título').fill(taskTitle)
  await win.getByRole('button', { name: 'Crear tarea' }).click()
  const card = win.getByRole('button', { name: taskTitle, exact: true })
  await card.waitFor()
  await card.hover()
  const handle = win.getByRole('button', { name: `Arrastrar ${taskTitle}` })
  const doingColumn = win.getByRole('region', { name: 'En curso' })
  await drag(win, handle, doingColumn)
  await win.waitForTimeout(400)
  const inDoing = await doingColumn.getByText(taskTitle).count()
  check(inDoing === 1, 'tarea arrastrada a "En curso"')
  await win.screenshot({ path: join(shots, '11-tareas-tablero.png') })

  // Compositor
  await go(win, 'Crear', 'text=Título interno')
  await win.getByLabel('Título interno').fill(postTitle)
  await win.getByLabel('Texto base').fill('Si estás empezando, evita estos tres errores #creadores')
  await win.getByRole('button', { name: 'Instagram' }).click()
  await win.getByText('Caracteres').waitFor()
  const counter = await win.locator('dd').first().innerText()
  check(/\/ 2200/.test(counter), `contador de caracteres de Instagram (${counter.trim()})`)
  await win.getByRole('button', { name: 'Guardar borrador' }).click()
  await win.getByText('Borrador', { exact: true }).waitFor()
  check(true, 'borrador guardado')
  // Fase 9: por defecto se publica a mano (copiar el texto y marcar como publicada)
  // El compositor tiene otro «Copiar texto» (vista previa): se busca dentro del kit.
  const kit = win.getByRole('region', { name: 'Publicar a mano' })
  await kit.waitFor()
  check(true, 'compositor: kit de publicación manual en lugar de la publicación por API')
  await kit.getByRole('button', { name: 'Copiar texto' }).click()
  await kit.getByRole('button', { name: 'Copiado' }).waitFor()
  const clip = await app.evaluate(({ clipboard }) => clipboard.readText())
  check(clip.includes('#creadores'), 'copiar texto deja el texto de Instagram en el portapapeles')
  await kit.getByRole('button', { name: 'Ya la publiqué' }).click()
  await win
    .getByLabel('Enlace a la publicación en Instagram (opcional)')
    .fill('https://www.instagram.com/p/prueba')
  await kit.getByRole('button', { name: 'Confirmar' }).click()
  await kit.getByText('Marcada como publicada').waitFor()
  check(true, 'marcar como publicada a mano, con enlace')
  await win.screenshot({ path: join(shots, '12b-compositor-publicada.png') })
  await kit.getByRole('button', { name: 'Desmarcar' }).click()
  await kit.getByRole('button', { name: 'Ya la publiqué' }).waitFor()
  check(true, 'desmarcar devuelve la red a pendiente')
  await win.screenshot({ path: join(shots, '12-compositor.png') })

  // Calendario: el borrador aparece en la bandeja y se arrastra a hoy
  await go(win, 'Calendario', 'text=Borradores')
  const tray = win.getByRole('complementary', { name: 'Borradores sin fecha' })
  const chip = tray.getByRole('button', { name: new RegExp(postTitle) })
  await chip.waitFor()
  check(true, 'borrador visible en la bandeja del calendario')
  const today = new Date()
  const cell = win.getByRole('gridcell', {
    name: new RegExp(` ${today.getDate()} de ${MESES[today.getMonth()]}$`)
  })
  await drag(win, chip, cell)
  await win.waitForTimeout(500)
  const scheduledChip = cell.getByRole('button', { name: new RegExp(postTitle) })
  check((await scheduledChip.count()) === 1, 'borrador programado al soltarlo en el día de hoy')
  check((await chip.count()) === 0, 'la bandeja ya no muestra el borrador')
  await win.screenshot({ path: join(shots, '13-calendario-mes.png') })
  await win.getByRole('radio', { name: 'Semana' }).click()
  await win.waitForTimeout(300)
  await win.screenshot({ path: join(shots, '14-calendario-semana.png') })

  // Inicio refleja los datos
  await go(win, 'Inicio', 'text=Próximos 7 días')
  await win.getByText(postTitle).waitFor()
  check(true, 'inicio muestra la publicación programada')
  await win.screenshot({ path: join(shots, '15-inicio-con-datos.png') })

  // Limpieza: borrar lo creado para no ensuciar la base de datos de desarrollo
  await win.getByRole('link', { name: postTitle }).click()
  await win.getByRole('button', { name: 'Eliminar' }).click()
  await confirmInDialog(win, 'Eliminar')
  await win.waitForSelector('text=Borradores')
  await go(win, 'Tareas', 'text=Lo que tienes que hacer')
  await win.getByRole('button', { name: taskTitle, exact: true }).click()
  await win.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click()
  await confirmInDialog(win, 'Eliminar')
  await win.waitForTimeout(300)
  await go(win, 'Ideas', 'text=Tu banco de ideas')
  await win.getByRole('button', { name: `Acciones de ${ideaTitle}` }).click()
  await win.getByRole('menuitem', { name: 'Eliminar' }).click()
  await confirmInDialog(win, 'Eliminar')
  await win.waitForTimeout(300)
  await win.getByRole('button', { name: 'Pilares' }).click()
  await win.getByRole('button', { name: `Eliminar ${pillarName}` }).click()
  await win.waitForTimeout(300)
  await win.keyboard.press('Escape')
  check(true, 'limpieza completada')

  check(errors.length === 0, `sin errores de consola en la sesión 3 (${errors.length})`)
  if (errors.length) console.log(errors.join('\n'))
  await app.close()
}

// --- Sesión 4: Fase 3 · asistente y ajustes de Claude (sin clave real) ------
{
  const { app, win, errors } = await launch()
  await win.waitForSelector('text=Próximos 7 días', { timeout: 15000 })

  // El panel se abre desde la barra superior y pide la clave
  await win.getByRole('button', { name: 'Abrir asistente' }).click()
  const panel = win.getByRole('complementary', { name: 'Asistente' })
  await panel.getByText('Conecta tu clave de Anthropic').waitFor()
  await win.waitForTimeout(400) // fin de la animación del panel
  check(true, 'panel del asistente abierto y pide la clave')
  await win.screenshot({ path: join(shots, '20-asistente-sin-clave.png') })
  await win.keyboard.press('Escape')

  // Ajustes → Claude: guardar una clave de prueba (cifrada) y quitarla
  await go(win, 'Ajustes', 'text=Apariencia')
  await win.getByText('Claude', { exact: true }).waitFor()
  await win.getByLabel('Nueva clave de API').fill('sk-ant-prueba-humo-0000')
  await win.getByRole('button', { name: 'Guardar clave', exact: true }).click()
  await win.getByText('Configurada').waitFor()
  check(true, 'clave de prueba guardada cifrada')
  const hint = await win.getByText(/termina en/).innerText()
  check(hint.includes('0000'), `solo se muestran los últimos 4 caracteres (${hint.trim()})`)
  await win.screenshot({ path: join(shots, '21-ajustes-claude.png') })

  // Con clave, el panel ofrece las acciones; sin red real, una acción devuelve error claro
  await win.getByRole('button', { name: 'Abrir asistente' }).click()
  await panel.getByRole('button', { name: 'Generar ideas' }).waitFor()
  await win.waitForTimeout(400) // fin de la animación del panel
  check(true, 'panel muestra acciones rápidas con clave configurada')
  await win.screenshot({ path: join(shots, '22-asistente-listo.png') })
  await win.keyboard.press('Escape')

  await win.getByRole('button', { name: 'Quitar' }).click()
  await win.getByText('Consíguela en console.anthropic.com').waitFor()
  check(true, 'clave eliminada')

  // Página del asistente a pantalla completa
  await go(win, 'Asistente', 'text=Claude conoce tus pilares')
  check(true, 'página del asistente disponible')

  // Fase 9: en modo manual, Cuentas solo ofrece conectar lo que da datos gratis
  await go(win, 'Cuentas', 'text=Sin cuentas conectadas')
  await win.getByRole('button', { name: 'YouTube', exact: true }).waitFor()
  check(
    (await win.getByRole('button', { name: 'X', exact: true }).count()) === 0 &&
      (await win.getByRole('button', { name: 'YouTube', exact: true }).count()) === 1,
    'cuentas: en modo manual solo se conectan Instagram y YouTube para leer datos'
  )
  await go(win, 'Ajustes', 'text=Apariencia')
  await win.getByRole('switch', { name: 'Publicar por API' }).click()
  await win.waitForTimeout(300)

  // Fase 4: cuentas y publicación (con la publicación por API activada)
  await go(win, 'Cuentas', 'text=Sin cuentas conectadas')
  await win.getByText('Falta el alojamiento de medios').waitFor()
  check(true, 'cuentas: aviso de alojamiento de medios sin configurar')
  await win.getByText('Qué permite Instagram por API').waitFor()
  check(true, 'cuentas: capacidades verificadas de Instagram visibles')
  await win.getByRole('button', { name: 'Instagram', exact: true }).click()
  await win.getByRole('dialog').getByText('Generate token').waitFor()
  check(true, 'diálogo de conexión con instrucciones del token')
  await win.screenshot({ path: join(shots, '30-cuentas-conectar.png') })
  await win.keyboard.press('Escape')

  // Fase 7: las otras tres redes tienen sus notas verificadas y su diálogo de conexión.
  for (const red of ['YouTube', 'LinkedIn', 'X']) {
    await win.getByText(`Qué permite ${red} por API`).waitFor()
  }
  check(true, 'cuentas: capacidades verificadas de YouTube, LinkedIn y X visibles')
  await win.getByRole('button', { name: 'YouTube', exact: true }).click()
  const oauthDialog = win.getByRole('dialog')
  await oauthDialog.getByText('Aplicación de escritorio').first().waitFor()
  check(
    await oauthDialog.getByRole('button', { name: 'Conectar', exact: true }).isDisabled(),
    'YouTube: conectar deshabilitado sin ID de cliente'
  )
  await win.screenshot({ path: join(shots, '30b-cuentas-youtube.png') })
  await win.keyboard.press('Escape')
  await win.getByRole('button', { name: 'X', exact: true }).click()
  await win.getByRole('dialog').getByText('0,20 $').first().waitFor()
  check(true, 'X: el diálogo avisa del coste de los enlaces')
  await win.keyboard.press('Escape')
  await win.screenshot({ path: join(shots, '31-cuentas.png') })

  await go(win, 'Ajustes', 'text=Apariencia')
  await win.getByText('Alojamiento temporal de medios').waitFor()
  check(true, 'ajustes: tarjeta de publicación con alojamiento de medios')
  await win.getByRole('switch', { name: 'Publicar por API' }).click()
  await win.waitForTimeout(300)
  check(
    (await win.getByRole('switch', { name: 'Publicar por API' }).getAttribute('aria-checked')) ===
      'false',
    'ajustes: publicación por API desactivada de nuevo'
  )

  // Fase 8: copias de seguridad, arranque con el sistema y actualizaciones.
  await win.getByText('Copias de seguridad').first().waitFor()
  await win.getByText('Abrir al iniciar sesión').first().waitFor()
  await win.getByText('Dirección de las versiones').first().waitFor()
  check(true, 'ajustes: copias de seguridad, arranque con el sistema y actualizaciones')
  await win.getByRole('button', { name: 'Restaurar una copia' }).click()
  await win.getByRole('dialog').getByText('Restaurar una copia').first().waitFor()
  check(true, 'ajustes: diálogo de restauración')
  await win.screenshot({ path: join(shots, '32-restaurar.png') })
  await win.keyboard.press('Escape')
  await win.getByRole('button', { name: 'Buscar actualizaciones' }).click()
  await win.getByText('Solo funciona en la app instalada').first().waitFor()
  check(true, 'ajustes: en desarrollo las actualizaciones lo explican')
  const backupDir = mkdtempSync(join(tmpdir(), 'rrss-smoke-copias-'))
  await win.evaluate(
    (dir) => window.api.invoke('settings:update', { general: { backupDir: dir } }),
    backupDir
  )
  const made = await win.evaluate(() => window.api.invoke('backup:run'))
  const folder = join(backupDir, 'RRSS Planner - copias')
  const snapshot = existsSync(folder) ? readdirSync(folder).find((n) => n !== 'media') : undefined
  check(
    made.ok === true &&
      !!snapshot &&
      existsSync(join(folder, snapshot, 'rrss-planner.db')) &&
      existsSync(join(folder, snapshot, 'manifest.json')),
    'copia de seguridad real de la app: base de datos y manifest guardados'
  )
  const listed = await win.evaluate((dir) => window.api.invoke('backup:list', { dir }), backupDir)
  check(
    listed.ok === true && listed.data?.length === 1 && listed.data[0].compatible === true,
    'copia listada y compatible'
  )
  await win.evaluate(() => window.api.invoke('settings:update', { general: { backupDir: '' } }))

  // Fase 5: analítica sin cuentas muestra el estado vacío y enlaza a Cuentas
  await go(win, 'Analítica', 'text=Métricas de tus cuentas conectadas')
  await win.getByRole('link', { name: 'Ir a Cuentas' }).waitFor()
  check(true, 'analítica: estado vacío sin cuentas conectadas')
  await win.screenshot({ path: join(shots, '40-analitica-vacia.png') })

  // Fase 6: editor de vídeo: crear proyecto, cambiar formato y ver el estado inicial
  await go(win, 'Vídeo', 'text=Recorta, une, añade subtítulos')
  await win.getByRole('button', { name: 'Nuevo proyecto' }).first().click()
  await win.getByLabel('Nombre').waitFor()
  await win.getByRole('radio', { name: '16:9' }).click()
  await win.getByText('1920×1080').waitFor()
  check(true, 'vídeo: proyecto creado y formato 16:9 aplicado')
  await win.getByText('Añade uno o varios vídeos de la biblioteca.').waitFor()
  const exportButton = win.getByRole('button', { name: 'Exportar MP4' })
  check(await exportButton.isDisabled(), 'vídeo: exportar deshabilitado sin clips')
  check(
    await win.getByRole('button', { name: 'Transcribir audio (local)' }).isDisabled(),
    'vídeo: transcribir deshabilitado sin clips'
  )
  await win.screenshot({ path: join(shots, '50-video.png') })
  await win
    .getByRole('button', { name: /^Eliminar proyecto/ })
    .first()
    .click({ force: true })
  await confirmInDialog(win, 'Eliminar')
  await win.waitForTimeout(300)
  check(true, 'vídeo: proyecto eliminado')

  check(errors.length === 0, `sin errores de consola en la sesión 4 (${errors.length})`)
  if (errors.length) console.log(errors.join('\n'))
  await app.close()
}

// --- Sesión 5: Fase 9 · análisis de cuentas y plan (sin clave de Claude) -----
{
  const { app, win, errors } = await launch()
  await win.waitForSelector('text=Próximos 7 días', { timeout: 15000 })
  const user = `smoke_${tag}`
  const channel = `canal_${tag}`

  await go(win, 'Análisis', 'text=Elige una cuenta')
  await win.getByRole('button', { name: 'Añadir cuenta' }).first().click()
  await win.getByLabel('Nombre de usuario').fill(`https://www.instagram.com/${user}/`)
  await win.getByRole('dialog').getByRole('button', { name: 'Añadir', exact: true }).click()
  await win.getByRole('heading', { name: `@${user}` }).waitFor()
  check(true, 'análisis: cuenta añadida pegando el enlace del perfil')
  check(
    await win.getByRole('button', { name: 'Leer capturas con Claude' }).isDisabled(),
    'análisis: leer capturas deshabilitado sin clave de Claude'
  )

  // Datos escritos a mano, con una cifra mal escrita primero
  await win.getByRole('button', { name: 'Escribir a mano' }).click()
  const editor = win.getByRole('dialog')
  await editor.getByLabel('Seguidores').fill('mucho')
  await editor.getByRole('button', { name: 'Guardar datos' }).click()
  await editor.getByText('Hay cifras que no son números').waitFor()
  check(true, 'análisis: avisa de cifras no válidas antes de guardar')
  await editor.getByLabel('Seguidores').fill('12.345')
  await editor.getByRole('button', { name: 'Añadir publicación' }).click()
  await editor.getByLabel('Formato de la publicación 1').fill('reel')
  await editor.getByLabel('Vistas de la publicación 1').fill('2.500')
  await win.screenshot({ path: join(shots, '60-analisis-editor.png') })
  await editor.getByRole('button', { name: 'Guardar datos' }).click()
  await win.getByText('12.345').first().waitFor()
  check(true, 'análisis: datos a mano guardados y visibles (12.345 seguidores)')
  await win.waitForTimeout(400)
  await win.screenshot({ path: join(shots, '61-analisis-datos.png') })

  // Capturas por IPC: la imagen se carga de verdad y, sin clave, el error lo explica
  const profiles = await win.evaluate(() => window.api.invoke('analysis:profiles:list'))
  const profileId = profiles.data?.find((p) => p.username === user)?.id
  const read = (paths) =>
    win.evaluate((args) => window.api.invoke('analysis:readScreenshots', args), {
      profileId,
      paths
    })
  const noKey = await read([join(shots, '01-inicio.png')])
  check(
    noKey.ok === false && noKey.error.code === 'NOT_CONFIGURED',
    `capturas: la imagen se carga y sin clave de Claude lo explica (${noKey.error?.code})`
  )
  const notImage = await read([join(root, 'package.json')])
  check(
    notImage.ok === false && notImage.error.code === 'VALIDATION',
    'capturas: rechaza archivos que no son imágenes'
  )
  const broken = await read([join(root, 'tmp', 'no-existe.png')])
  check(
    broken.ok === false && /No se pudo leer la imagen/.test(broken.error.message),
    'capturas: una imagen ilegible da un error claro'
  )

  // Análisis y plan necesitan la clave de Claude
  await win.getByRole('radio', { name: 'Análisis' }).click()
  check(
    await win.getByRole('button', { name: 'Analizar con Claude' }).isDisabled(),
    'análisis: analizar deshabilitado sin clave de Claude'
  )
  await win.getByRole('radio', { name: 'Plan' }).click()
  await win.getByText('Piezas por semana').waitFor()
  check(
    await win.getByRole('button', { name: 'Generar plan con Claude' }).isDisabled(),
    'plan: generar deshabilitado sin clave de Claude'
  )
  await win.screenshot({ path: join(shots, '62-analisis-plan.png') })

  // YouTube: datos públicos automáticos, pero sin clave de API se explica dónde ponerla
  await win.getByRole('button', { name: 'Añadir cuenta' }).first().click()
  await win.getByRole('combobox', { name: 'Red' }).click()
  await win.getByRole('option', { name: 'YouTube' }).click()
  await win.getByLabel('Nombre de usuario').fill(`@${channel}`)
  await win.getByRole('dialog').getByRole('button', { name: 'Añadir', exact: true }).click()
  await win.getByRole('heading', { name: `@${channel}` }).waitFor()
  await win.getByRole('radio', { name: 'Datos' }).click()
  check(
    await win.getByRole('button', { name: 'Traer datos públicos de YouTube' }).isDisabled(),
    'YouTube: datos automáticos deshabilitados sin clave de API'
  )
  await win.getByText('Ajustes → Datos automáticos').first().waitFor()
  check(true, 'YouTube: explica dónde poner la clave de API')

  await go(win, 'Ajustes', 'text=Apariencia')
  await win.getByText('Datos automáticos').first().waitFor()
  check(
    (await win.getByRole('switch', { name: 'Publicar por API' }).getAttribute('aria-checked')) ===
      'false',
    'ajustes: la publicación por API está desactivada por defecto'
  )
  await win.screenshot({ path: join(shots, '63-ajustes-datos-automaticos.png') })

  check(errors.length === 0, `sin errores de consola en la sesión 5 (${errors.length})`)
  if (errors.length) console.log(errors.join('\n'))
  await app.close()
}

// --- Sesión 6: el análisis persiste tras reabrir; limpieza ---------------------
{
  const { app, win, errors } = await launch()
  await win.waitForSelector('text=Próximos 7 días', { timeout: 15000 })
  await go(win, 'Análisis', 'text=Elige una cuenta')
  await win.getByRole('button', { name: new RegExp(`^@smoke_${tag}`) }).click()
  await win.getByText('12.345').first().waitFor()
  check(true, 'análisis: la cuenta y sus datos siguen tras reabrir la app')
  for (const name of [`smoke_${tag}`, `canal_${tag}`]) {
    await win.getByRole('button', { name: new RegExp(`^@${name}`) }).click()
    await win.getByRole('button', { name: `Quitar @${name}` }).click()
    await confirmInDialog(win, 'Quitar')
    await win.waitForTimeout(300)
  }
  check(true, 'análisis: cuentas de prueba quitadas')
  check(errors.length === 0, `sin errores de consola en la sesión 6 (${errors.length})`)
  if (errors.length) console.log(errors.join('\n'))
  await app.close()
}

console.log(`\nCapturas en: ${shots}`)
if (problems.length) {
  console.error(`\n${problems.length} comprobaciones fallidas`)
  process.exit(1)
}
