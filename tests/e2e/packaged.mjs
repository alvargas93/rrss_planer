/**
 * Prueba de la app EMPAQUETADA (la que se instala), no la de desarrollo.
 *
 * Uso:  npx electron-builder --dir && node tests/e2e/packaged.mjs
 *
 * Comprueba que el paquete arranca, que SQLite y las migraciones funcionan fuera del
 * código fuente, que FFmpeg y el motor de voz están desempaquetados y que las
 * actualizaciones se explican bien. Usa la carpeta de datos REAL de la app instalada
 * (%APPDATA%\RRSS Planner), así que conviene ejecutarla solo si no hay datos que perder.
 */
import { _electron as electron } from 'playwright-core'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const exe = join(root, 'dist', 'win-unpacked', 'RRSS Planner.exe')
const unpacked = join(
  root,
  'dist',
  'win-unpacked',
  'resources',
  'app.asar.unpacked',
  'node_modules'
)

const problems = []
const check = (ok, label) => {
  console.log(`${ok ? 'OK ' : 'FAIL'} ${label}`)
  if (!ok) problems.push(label)
}

check(existsSync(exe), 'el ejecutable empaquetado existe')
check(existsSync(join(unpacked, 'ffmpeg-static', 'ffmpeg.exe')), 'FFmpeg está fuera del asar')
check(
  existsSync(join(unpacked, 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe')),
  'ffprobe está fuera del asar'
)
check(
  existsSync(join(unpacked, 'onnxruntime-node')),
  'el motor de voz (ONNX Runtime) está fuera del asar'
)
check(
  existsSync(join(unpacked, 'better-sqlite3', 'prebuilds', 'win32-x64.node')),
  'SQLite nativo está fuera del asar'
)
check(
  existsSync(join(root, 'dist', 'win-unpacked', 'resources', 'drizzle', 'meta', '_journal.json')),
  'las migraciones viajan con la app'
)

const app = await electron.launch({ executablePath: exe })
const errors = []
try {
  const win = await app.firstWindow()
  win.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  win.on('pageerror', (e) => errors.push(e.message))
  await win.waitForLoadState('domcontentloaded')
  await win.getByRole('link', { name: /^Inicio/ }).waitFor({ timeout: 30_000 })
  check((await win.title()) === 'RRSS Planner', 'la app empaquetada abre su ventana')

  const info = await win.evaluate(() => window.api.invoke('app:getInfo'))
  const data = info.data ?? info
  check(info.ok === true && data.isDev === false, `modo instalado (isDev=${data.isDev})`)
  check(existsSync(data.dbPath), `base de datos creada en ${data.dbPath}`)

  await win.getByRole('link', { name: /^Ajustes/ }).click()
  await win.getByText('Copias de seguridad').first().waitFor()
  await win.getByRole('button', { name: 'Buscar actualizaciones' }).click()
  await win.getByText('Indica abajo la dirección').first().waitFor()
  check(true, 'sin dirección de versiones, las actualizaciones lo explican')

  await win.getByRole('link', { name: /^Vídeo/ }).click()
  await win.getByText('Nuevo proyecto').first().waitFor()
  check(true, 'la pantalla de vídeo carga en el paquete')
  check(errors.length === 0, `sin errores de consola (${errors.length})`)
  if (errors.length) console.log(errors)
} finally {
  await app.close()
}

if (problems.length) {
  console.log(`\n${problems.length} comprobaciones fallidas`)
  process.exit(1)
}
console.log('\nPaquete correcto')
