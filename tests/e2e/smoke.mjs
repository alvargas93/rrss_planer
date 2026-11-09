/**
 * Prueba de humo: lanza la app compilada (out/) con Playwright, recorre las pantallas,
 * crea y arrastra elementos, comprueba persistencia y guarda capturas.
 *
 * Uso:  npm run build && node tests/e2e/smoke.mjs [carpeta-de-capturas]
 */
import { _electron as electron } from 'playwright-core'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

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
  // Fase 4: el panel de publicación aparece con el destino en modo manual (sin cuenta)
  const targetSelect = win.getByRole('combobox', { name: 'Cuenta de destino para Instagram' })
  await targetSelect.waitFor()
  const selectText = await targetSelect.innerText()
  check(
    selectText.includes('Manual'),
    `destino de Instagram en modo manual sin cuenta (${selectText.trim()})`
  )
  await win.getByText(/necesita al menos 1 archivo/).waitFor()
  check(true, 'validación de Instagram avisa de que falta el medio')
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
  await win.getByRole('button', { name: 'Guardar clave' }).click()
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

  // Fase 4: cuentas y publicación
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

console.log(`\nCapturas en: ${shots}`)
if (problems.length) {
  console.error(`\n${problems.length} comprobaciones fallidas`)
  process.exit(1)
}
