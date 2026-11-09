# Distribución · instalar, actualizar y hacer copias

Guía en lenguaje sencillo. Estado a **2026-11-09** (Fase 8).

## 1. Generar el instalador de Windows

En la carpeta del proyecto:

```bash
npm run build:win
```

Resultado en `dist/`:

| Archivo                                 | Para qué sirve                                    |
| --------------------------------------- | ------------------------------------------------- |
| `rrss-planner-X.Y.Z-setup.exe`          | El instalador que ejecutas o compartes            |
| `latest.yml`                            | Índice que lee la app para saber si hay novedades |
| `rrss-planner-X.Y.Z-setup.exe.blockmap` | Permite descargar solo lo que cambió              |

La versión sale de `version` en `package.json`. **Súbela antes de cada versión nueva.**

El instalador pesa unos 226 MB, porque lleva dentro FFmpeg (editor de vídeo) y el motor de
transcripción local. El modelo de voz no va incluido: se descarga la primera vez que se usa.
Instala por usuario (no pide permisos de administrador) y crea un acceso directo en el escritorio.
El primer instalador (`0.1.0`) se generó y se probó desempaquetado el 2026-11-09; **no se ha
instalado de verdad en ningún equipo**, así que conviene probarlo una vez (ver «Cómo probarlo»
en el informe de la fase).

**Aviso de Windows (SmartScreen).** El instalador no está firmado, así que Windows mostrará
«Windows protegió su PC». Se pulsa «Más información» y «Ejecutar de todas formas». Firmarlo
cuesta un certificado de pago anual; para uso personal no es necesario.

## 2. Mac

El DMG se genera con `npm run build:mac`, pero **solo se puede construir desde un Mac**. Sin
firma de Apple (cuenta de desarrollador de pago), macOS avisa al abrirlo y **no puede
actualizarse solo**: habría que descargar el DMG nuevo a mano. Esta parte no se ha podido probar
desde Windows.

## 3. Actualizaciones automáticas

La app no trae una dirección fija: la indicas en **Ajustes → Actualizaciones**. Para publicar
una versión nueva:

1. Sube `version` en `package.json` (por ejemplo de 0.1.0 a 0.2.0).
2. Ejecuta `npm run build:win`.
3. Sube a un sitio web accesible los tres archivos de `dist/` indicados arriba. Con GitHub:
   crea una _Release_ con la etiqueta `v0.2.0` y adjúntalos.
4. En Ajustes pon la dirección de esa carpeta. Con GitHub Releases suele ser
   `https://github.com/USUARIO/REPO/releases/latest/download/` (**no verificado hoy**; el
   repositorio debe ser público).

Ni la descarga ni la instalación son automáticas: la app avisa y tú pulsas «Descargar» y luego
«Reiniciar e instalar». Los datos no se tocan al actualizar.

## 4. Copias de seguridad

**Ajustes → Copias de seguridad.** Se elige una carpeta (mejor en otro disco o sincronizada con
la nube) y, si quieres, una copia automática diaria, semanal o mensual.

- Dentro se crea `RRSS Planner - copias/` con una carpeta `media/` (todos tus medios, sin
  repetirlos) y una carpeta por copia con la base de datos.
- Las copias automáticas conservan las 8 últimas. Las manuales no se borran nunca.
- **Las claves y los tokens no se incluyen.** Están cifrados con tu usuario de Windows y no
  servirían en otro equipo. Al restaurar en otro equipo habrá que escribir de nuevo la clave de
  Claude y reconectar las cuentas. En el mismo equipo se conservan.

**Restaurar:** Ajustes → «Restaurar una copia» → elegir la carpeta y la copia → «Restaurar y
reiniciar». La base de datos de antes no se borra: queda en la carpeta de datos, en
`antes-de-restaurar-…`. Los medios solo se añaden, nunca se quitan.

## 5. Arrancar con el sistema

**Ajustes → General → Abrir al iniciar sesión.** La app arranca en la bandeja, sin ventana, y
las publicaciones programadas salen aunque no la abras. Solo funciona en la app instalada.

## 6. Dónde están tus datos

`%APPDATA%\RRSS Planner\data` en la app instalada (la de desarrollo usa `RRSS Planner-dev`).
Desinstalar la app **no** borra esa carpeta.

## 7. Publicar versiones con GitHub Releases (decidido el 2026-11-09)

Para que la app pueda leer las versiones, el sitio donde se publican debe ser **público**. Para no hacer público tu código, se usa un repositorio aparte que solo contiene las versiones.

**Una sola vez**

1. En github.com crea un repositorio nuevo, por ejemplo `rrss-planner-versiones`, marcado como **Public** y vacío. No subas código ahí.
2. En la app, Ajustes → Actualizaciones, pega esta dirección cambiando TU_USUARIO:
   `https://github.com/TU_USUARIO/rrss-planner-versiones/releases/latest/download/`

**Cada versión nueva**

1. Sube `version` en `package.json`, por ejemplo a 0.2.0.
2. Ejecuta `npm run build:win`.
3. En el repositorio de versiones: Releases → Draft a new release → etiqueta `v0.2.0`.
4. Adjunta los tres archivos de `dist/`: `rrss-planner-0.2.0-setup.exe`, `latest.yml` y `rrss-planner-0.2.0-setup.exe.blockmap`. Pulsa Publish release.
5. En la app instalada, Ajustes → Actualizaciones → «Buscar actualizaciones». Debe ofrecer la versión nueva.

**Primera prueba recomendada:** instala la 0.1.0, publica una 0.1.1 de prueba y comprueba que la app la ofrece, la descarga y se reinicia con ella. Que GitHub sirva así `latest.yml` **no está verificado todavía**.
