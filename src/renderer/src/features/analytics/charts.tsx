import * as React from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import type { MetricPoint } from '@shared/domain/analytics'
import { fmtDay } from '@renderer/lib/dates'

/**
 * Gráficos de una sola serie: color de acento de la app, línea de 2 px, rejilla
 * de un paso sobre el fondo, tooltip con cruz. Sin leyenda (el título nombra la serie).
 * Para varias series se usarían pequeños múltiplos, nunca un segundo eje.
 */
const stroke = 'var(--accent)'
const grid = 'var(--border)'
const ink = 'var(--text-muted)'

const fmt = (n: number): string => n.toLocaleString('es')

function ChartTooltip({
  active,
  payload,
  label
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}): React.JSX.Element | null {
  if (!active || !payload?.length || !label) return null
  return (
    <div className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-md">
      <p className="text-muted">{fmtDay(`${label}T12:00:00`)}</p>
      <p className="font-semibold">{fmt(payload[0]?.value ?? 0)}</p>
    </div>
  )
}

const axisProps = {
  tick: { fill: ink, fontSize: 11 },
  axisLine: false as const,
  tickLine: false as const
}

export function TrendChart({
  points,
  height = 220
}: {
  points: MetricPoint[]
  height?: number
}): React.JSX.Element {
  const data = points.map((p) => ({ day: p.day, value: p.value }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={grid} strokeWidth={1} vertical={false} />
        <XAxis
          dataKey="day"
          {...axisProps}
          tickFormatter={(d: string) => fmtDay(`${d}T12:00:00`)}
          minTickGap={32}
        />
        <YAxis {...axisProps} width={44} tickFormatter={fmt} allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: ink, strokeWidth: 1 }} />
        <Area
          type="monotone"
          dataKey="value"
          stroke={stroke}
          strokeWidth={2}
          fill="url(#trend-fill)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)', fill: stroke }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function BarsChart({
  points,
  height = 220
}: {
  points: MetricPoint[]
  height?: number
}): React.JSX.Element {
  const data = points.map((p) => ({ day: p.day, value: p.value }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
        <CartesianGrid stroke={grid} strokeWidth={1} vertical={false} />
        <XAxis
          dataKey="day"
          {...axisProps}
          tickFormatter={(d: string) => fmtDay(`${d}T12:00:00`)}
          minTickGap={32}
        />
        <YAxis {...axisProps} width={44} tickFormatter={fmt} allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--surface-2)' }} />
        <Bar
          dataKey="value"
          fill={stroke}
          maxBarSize={24}
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
