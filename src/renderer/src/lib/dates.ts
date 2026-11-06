import { format, formatDistanceToNowStrict, isPast, isToday, isTomorrow } from 'date-fns'
import { es } from 'date-fns/locale'

const opts = { locale: es }

export function fmtDay(iso: string): string {
  return format(new Date(iso), 'd MMM', opts)
}

export function fmtDateTime(iso: string): string {
  return format(new Date(iso), "d MMM 'a las' HH:mm", opts)
}

export function fmtTime(iso: string): string {
  return format(new Date(iso), 'HH:mm', opts)
}

export function fmtRelative(iso: string): string {
  const date = new Date(iso)
  if (isToday(date)) return 'hoy'
  if (isTomorrow(date)) return 'mañana'
  const distance = formatDistanceToNowStrict(date, { ...opts, addSuffix: true })
  return distance
}

export function isOverdue(iso: string | null): boolean {
  return !!iso && isPast(new Date(iso)) && !isToday(new Date(iso))
}

/** Clave de día en hora local, para agrupar en el calendario. */
export function dayKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/** Para <input type="datetime-local">, que trabaja en hora local sin zona. */
export function toDateTimeLocal(iso: string | null): string {
  return iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : ''
}

export function fromDateTimeLocal(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** Para <input type="date">. */
export function toDateInput(iso: string | null): string {
  return iso ? format(new Date(iso), 'yyyy-MM-dd') : ''
}

export function fromDateInput(value: string): string | null {
  if (!value) return null
  // Mediodía local: evita que un cambio de zona horaria mueva el día.
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
