/**
 * Prueba de humo: lanza la app compilada (out/) con Playwright, navega, cambia el tema,
 * comprueba que se persiste al reabrir y guarda capturas de pantalla.
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

// --- Sesión 1: inicio, ajustes, cambio de tema -------------------------------
{
  const { app, win, errors } = await launch()
  await win.waitForSelector('text=Hoja de ruta', { timeout: 15000 })
  check((await win.title()) === 'RRSS Planner', 'título de la ventana es "RRSS Planner"')
  await win.screenshot({ path: join(shots, '01-inicio.png') })

  await win.getByRole('link', { name: 'Ajustes', exact: true }).click()
  await win.waitForSelector('text=Apariencia')
  const info = await win.evaluate(() => window.api.invoke('app:getInfo'))
  check(info.ok, 'IPC app:getInfo responde')
  check(existsSync(info.data.dbPath), `base de datos creada en ${info.data.dbPath}`)
  await win.screenshot({ path: join(shots, '02-ajustes-claro.png') })

  await win.getByRole('radio', { name: 'Claro' }).click()
  await win.waitForFunction(() => document.documentElement.dataset.theme === 'light')
  check((await theme(win)) === 'light', 'tema claro aplicado al pulsar')
  await win.screenshot({ path: join(shots, '02b-ajustes-claro.png') })
  await win.getByRole('link', { name: 'Inicio', exact: true }).click()
  await win.waitForSelector('text=Hoja de ruta')
  await win.screenshot({ path: join(shots, '02c-inicio-claro.png') })
  await win.getByRole('link', { name: 'Ajustes', exact: true }).click()
  await win.waitForSelector('text=Apariencia')

  await win.getByRole('radio', { name: 'Oscuro' }).click()
  await win.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
  check((await theme(win)) === 'dark', 'tema oscuro aplicado al pulsar')
  await win.screenshot({ path: join(shots, '03-ajustes-oscuro.png') })

  await win.getByRole('link', { name: 'Inicio', exact: true }).click()
  await win.waitForSelector('text=Hoja de ruta')
  await win.screenshot({ path: join(shots, '04-inicio-oscuro.png') })

  await win.getByRole('link', { name: /Calendario/ }).click()
  await win.waitForSelector('text=llega en la Fase 2')
  check(true, 'sección futura muestra pantalla "pronto"')

  // Navegación por teclado: Tab hasta un enlace y Enter
  await win.keyboard.press('Tab')
  const focused = await win.evaluate(() => document.activeElement?.tagName)
  check(focused === 'A' || focused === 'BUTTON', `foco por teclado llega a un control (${focused})`)

  check(errors.length === 0, `sin errores de consola (${errors.length})`)
  if (errors.length) console.log(errors.join('\n'))
  await app.close()
}

// --- Sesión 2: la preferencia persiste -------------------------------------
{
  const { app, win } = await launch()
  await win.waitForSelector('text=Hoja de ruta', { timeout: 15000 })
  check((await theme(win)) === 'dark', 'tema oscuro persiste tras reabrir')
  await win.screenshot({ path: join(shots, '05-reabierta-oscuro.png') })

  // Devolver a "sistema" para dejar la app como estaba
  await win.getByRole('link', { name: 'Ajustes', exact: true }).click()
  await win
    .getByRole('radiogroup', { name: 'Tema' })
    .getByRole('radio', { name: 'Sistema' })
    .click()
  await win.waitForTimeout(300)
  await app.close()
}

console.log(`\nCapturas en: ${shots}`)
if (problems.length) {
  console.error(`\n${problems.length} comprobaciones fallidas`)
  process.exit(1)
}
