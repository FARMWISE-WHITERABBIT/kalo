"use client"

import { useRef, useState } from "react"
import { useNow } from "@/lib/use-now"

export type GameSeries = {
  key: string
  label: string
  color: string
  points: { t: number; p: number }[]
}

const W = 860
const H = 280
const PLOT_W = W - 56
const PLOT_TOP = 12
const PLOT_BOTTOM = H - 26

// Step-after semantics: a series' value at time t is its last print at or
// before t. Used both to draw and to read values under the crosshair.
function valueAt(points: { t: number; p: number }[], t: number): number | null {
  if (points.length === 0 || t < points[0].t) return points[0]?.p ?? null
  let lo = 0
  let hi = points.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (points[mid].t <= t) lo = mid
    else hi = mid
  }
  return points[hi].t <= t ? points[hi].p : points[lo].p
}

function niceTicks(lo: number, hi: number): number[] {
  const span = hi - lo
  const steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25]
  const step = steps.find((s) => span / s <= 5) ?? 0.25
  const ticks: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
    ticks.push(Math.round(v * 100) / 100)
  }
  return ticks
}

// Match-page chart: the three moneyline series (home / draw / away) drawn as
// step-after lines in one plot, with a shared crosshair whose tooltip reads
// every series at the hovered time, and a pulsing marker on each live price.
export function GameChart({ series }: { series: GameSeries[] }) {
  const [hoverT, setHoverT] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const clock = useNow()

  const drawn = series.filter((s) => s.points.length > 0)
  const lastT = Math.max(0, ...drawn.map((s) => s.points[s.points.length - 1].t))
  const now = clock ?? lastT

  // extend every series to "now" so quiet books still draw to the live edge
  const extended = drawn.map((s) => ({
    ...s,
    points: [...s.points, { t: Math.max(now, s.points[s.points.length - 1].t), p: s.points[s.points.length - 1].p }],
  }))

  const hasData = extended.some((s) => s.points.length >= 2)
  const t0 = hasData ? Math.min(...extended.map((s) => s.points[0].t)) : 0
  const t1 = hasData ? Math.max(...extended.map((s) => s.points[s.points.length - 1].t)) : 1
  const span = Math.max(t1 - t0, 1)

  let lo = 0
  let hi = 1
  if (hasData) {
    const vals = extended.flatMap((s) => s.points.map((pt) => pt.p))
    lo = Math.min(...vals)
    hi = Math.max(...vals)
    const pad = Math.max((hi - lo) * 0.1, 0.03)
    lo = Math.max(0, lo - pad)
    hi = Math.min(1, hi + pad)
    if (hi - lo < 0.12) {
      const mid = (hi + lo) / 2
      lo = Math.max(0, mid - 0.06)
      hi = Math.min(1, mid + 0.06)
    }
  }

  const X = (t: number) => ((t - t0) / span) * PLOT_W
  const Y = (p: number) => PLOT_BOTTOM - ((p - lo) / (hi - lo)) * (PLOT_BOTTOM - PLOT_TOP)

  const paths = extended.map((s) => {
    let d = `M ${X(s.points[0].t)} ${Y(s.points[0].p)}`
    for (let i = 1; i < s.points.length; i++) {
      d += ` H ${X(s.points[i].t)} V ${Y(s.points[i].p)}`
    }
    return { ...s, d }
  })

  const ticks = hasData ? niceTicks(lo, hi) : []
  const tickTimes = hasData ? [t0, t0 + span / 3, t0 + (2 * span) / 3, t1] : []

  const hovered =
    hoverT !== null
      ? extended
          .map((s) => ({ ...s, value: valueAt(s.points, hoverT) }))
          .filter((s): s is typeof s & { value: number } => s.value !== null)
          .sort((a, b) => b.value - a.value)
      : null

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!hasData || !wrapRef.current) return
    const rect = wrapRef.current.getBoundingClientRect()
    const vx = ((e.clientX - rect.left) / rect.width) * W
    if (vx < 0 || vx > PLOT_W) {
      setHoverT(null)
      return
    }
    setHoverT(t0 + (vx / PLOT_W) * span)
  }

  if (!hasData) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        Not enough trade history yet — the board is warming up.
      </div>
    )
  }

  return (
    <div>
      {/* current-value legend, Polymarket-style */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        {extended
          .map((s) => ({ ...s, value: s.points[s.points.length - 1].p }))
          .sort((a, b) => b.value - a.value)
          .map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-sm font-semibold">
              <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
              {s.label}
              <span className="tabular-nums" style={{ color: s.color }}>
                {Math.round(s.value * 100)}%
              </span>
            </span>
          ))}
      </div>

      <div
        ref={wrapRef}
        className="relative mt-2 cursor-crosshair"
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHoverT(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ height: "auto" }}>
          {ticks.map((g) => (
            <g key={g}>
              <line x1="0" x2={PLOT_W} y1={Y(g)} y2={Y(g)} stroke="var(--border)" strokeDasharray="2 6" />
              <text x={PLOT_W + 12} y={Y(g) + 4} fill="var(--muted-foreground)" fontSize="12">
                {Math.round(g * 100)}%
              </text>
            </g>
          ))}
          {tickTimes.map((t, i) => (
            <text
              key={i}
              x={Math.min(X(t), PLOT_W - 8)}
              y={H - 6}
              fill="var(--muted-foreground)"
              fontSize="11"
              textAnchor={i === 0 ? "start" : "middle"}
            >
              {new Date(t).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </text>
          ))}

          {paths.map((s) => (
            <path key={s.key} d={s.d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
          ))}

          {hoverT !== null && hovered && (
            <g>
              <line
                x1={X(hoverT)}
                x2={X(hoverT)}
                y1={PLOT_TOP}
                y2={PLOT_BOTTOM}
                stroke="var(--muted-foreground)"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.6"
              />
              {hovered.map((s) => (
                <circle
                  key={s.key}
                  cx={X(hoverT)}
                  cy={Y(s.value)}
                  r="4.5"
                  fill={s.color}
                  stroke="var(--card)"
                  strokeWidth="2"
                />
              ))}
            </g>
          )}

          {/* live price markers */}
          {extended.map((s) => {
            const last = s.points[s.points.length - 1]
            return (
              <g key={s.key}>
                <circle cx={X(last.t)} cy={Y(last.p)} r="3.5" fill={s.color}>
                  <animate attributeName="opacity" values="1;0.6;1" dur="1.8s" repeatCount="indefinite" />
                </circle>
                <circle cx={X(last.t)} cy={Y(last.p)} fill="none" stroke={s.color} strokeWidth="2">
                  <animate attributeName="r" values="3.5;10" dur="1.8s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.5;0" dur="1.8s" repeatCount="indefinite" />
                </circle>
              </g>
            )
          })}
        </svg>

        {/* tooltip: every series at the hovered time, values leading */}
        {hoverT !== null && hovered && hovered.length > 0 && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-border/60 bg-popover px-3 py-1.5 shadow-lg"
            style={{
              left: `${(X(hoverT) / W) * 100}%`,
              top: `${(Y(hovered[0].value) / H) * 100}%`,
              transform:
                X(hoverT) / PLOT_W > 0.72
                  ? "translate(calc(-100% - 10px), calc(-100% - 8px))"
                  : "translate(10px, calc(-100% - 8px))",
            }}
          >
            {hovered.map((s) => (
              <div key={s.key} className="flex items-center gap-2 whitespace-nowrap text-sm">
                <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
                <span className="font-bold tabular-nums">{Math.round(s.value * 100)}%</span>
                <span className="text-muted-foreground">{s.label}</span>
              </div>
            ))}
            <div className="mt-0.5 whitespace-nowrap text-xs text-muted-foreground">
              {new Date(hoverT).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
