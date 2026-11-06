# ADR 0001 · Electron + React + TypeScript como base de la app

- Fecha: 2026-11-06
- Estado: propuesto (pendiente de aprobación del propietario)

## Contexto

App de escritorio para Windows y Mac, de uso personal en v1 y comercial en v2. El
propietario no programa; el desarrollo lo hace Claude Code paso a paso. Se necesitan
SQLite local, FFmpeg, OAuth con servidor local, bandeja del sistema, notificaciones,
cifrado de secretos del SO y actualizaciones automáticas.

## Opciones consideradas

1. **Electron + React + TypeScript + Vite** (electron-vite, electron-builder).
2. **Tauri 2 + React + TypeScript** (backend en Rust).

## Decisión

Opción 1, Electron.

## Motivos

- Un único lenguaje (TypeScript) en interfaz, lógica y datos: menos piezas que explicar y depurar.
- Todas las integraciones necesarias existen maduras en npm y en la propia API de Electron
  (`safeStorage`, `Tray`, `Notification`, `autoUpdater`).
- Renderizado idéntico en Windows y Mac (mismo Chromium), lo que simplifica el diseño.

## Consecuencias

- Instalador de ~100 MB y mayor consumo de RAM que Tauri. Aceptable para una herramienta
  de productividad personal.
- Se mantiene `src/shared` libre de dependencias de Electron para que la lógica y la
  interfaz sean reutilizables si en la v2 se cambia de runtime o se añade servidor.
