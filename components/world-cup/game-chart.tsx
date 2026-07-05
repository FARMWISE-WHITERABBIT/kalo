"use client"

import { useRef, useState } from "react"
import { useNow } from "@/lib/use-now"
import { cn } from "@/lib/utils"

export type GameSeries = {
  key: string
  label: string
  color: string
  points: { t: number; p: number }[]
}

const WINDOWS: { label: string; ms: number | null }[] = [
  { label: "1H", ms: 60 * 60 * 1000 },
  { label: "6H", ms: 6 * 60 * 60 * 1000 },
  { label: "1D", ms: 24 * 60 * 60 * 1000 },
  { label: "1W", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "ALL", ms: null },
]

const W = 860
const H = 300
const PLOT_W = W - 56
const PLOT_TOP = 14
const PLOT_BOTTOM = H - 26
const MAX_POINTS = 240

// Step-after semantics: a series' value at time t is its last print at or
// before t. Used both to draw and to read values under the crosshair.
function valueAt(points: { t: number; p: number }[], t: number): number | null {
  if (points.length === 0) return null
  if (t < points[0].t) return points[0].p
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

function windowed(points: { t: number; p: number }[], cutoff: number | null, now: number) {
  if (points.length === 0) return points
  let pts = points
  if (cutoff !== null) {
    const inWin = points.filter((pt) => pt.t >= cutoff)
    const pre = points.filter((pt) => pt.t < cutoff)
    // carry the last pre-window price in so a quiet window still draws
    pts = pre.length ? [{ t: cutoff, p: pre[pre.length - 1].p }, ...inWin] : inWin
  }
  if (pts.length === 0) return pts
  // extend to "now" so every line reaches the live edge
  pts = [...pts, { t: Math.max(now, pts[pts.length - 1].t), p: pts[pts.length - 1].p }]
  // downsample dense series to the last price per time bucket
  if (pts.length > MAX_POINTS) {
    const t0 = pts[0].t
    const bucket = Math.max(1, (pts[pts.length - 1].t - t0) / MAX_POINTS)
    const kept = [pts[0]]
    let cur = 0
    for (let i = 1; i < pts.length - 1; i++) {
      const b = Math.floor((pts[i].t - t0) / bucket)
      if (b !== cur) {
        kept.push(pts[i])
        cur = b
      } else {
        kept[kept.length - 1] = pts[i]
      }
    }
    kept.push(pts[pts.length - 1])
    pts = kept
  }
  return pts
}

// Match-page chart: the three moneyline series (home / draw / away) drawn as
// step-after lines in one plot with Polymarket-style line-end labels, time
// windows, a shared crosshair whose tooltip reads every series at the
// hovered time, and a pulsing marker on each live price.
export function GameChart({ series }: { series: GameSeries[] }) {
  const [win, setWin] = useState("ALL")
  const [hoverT, setHoverT] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const clock = useNow()

  const raw = series.filter((s) => s.points.length > 0)
  const lastT = Math.max(0, ...raw.map((s) => s.points[s.points.length - 1].t))
  const now = clock ?? lastT
  const windowMs = WINDOWS.find((x) => x.label === win)?.ms ?? null
  const cutoff = windowMs ? now - windowMs : null

  const drawn = raw
    .map((s) => ({ ...s, points: windowed(s.points, cutoff, now) }))
    .filter((s) => s.points.length >= 2)

  const hasData = drawn.length > 0
  const t0 = hasData ? Math.min(...drawn.map((s) => s.points[0].t)) : 0
  const t1 = hasData ? Math.max(...drawn.map((s) => s.points[s.points.length - 1].t)) : 1
  const span = Math.max(t1 - t0, 1)

  let lo = 0
  let hi = 1
  if (hasData) {
    const vals = drawn.flatMap((s) => s.points.map((pt) => pt.p))
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

  const paths = drawn.map((s) => {
    let d = `M ${X(s.points[0].t)} ${Y(s.points[0].p)}`
    for (let i = 1; i < s.points.length; i++) {
      d += ` H ${X(s.points[i].t)} V ${Y(s.points[i].p)}`
    }
    return { ...s, d, last: s.points[s.points.length - 1] }
  })

  // line-end labels ("England 40%"), nudged apart when lines converge
  const labels = paths
    .map((s) => ({ key: s.key, label: s.label, color: s.color, pct: Math.round(s.last.p * 100), y: Y(s.last.p) }))
    .sort((a, b) => a.y - b.y)
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].y - labels[i - 1].y < 20) labels[i].y = labels[i - 1].y + 20
  }
  for (const l of labels) {
    l.y = Math.max(PLOT_TOP + 8, Math.min(PLOT_BOTTOM - 4, l.y))
  }

  const ticks = hasData ? niceTicks(lo, hi) : []
  const tickTimes = hasData ? [t0, t0 + span / 3, t0 + (2 * span) / 3, t1] : []

  const hovered =
    hoverT !== null
      ? drawn
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

  return (
    <div>
      {hasData ? (
        <div
          ref={wrapRef}
          className="relative cursor-crosshair"
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

            {/* line-end labels, Polymarket-style */}
            {labels.map((l) => (
              <text key={l.key} x={PLOT_W - 8} y={l.y - 6} textAnchor="end" fontSize="13">
                <tspan fill={l.color} fontWeight="700">
                  {l.label}{" "}
                </tspan>
                <tspan fill={l.color} fontWeight="800">
                  {l.pct}%
                </tspan>
              </text>
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
            {paths.map((s) => (
              <g key={s.key}>
                <circle cx={X(s.last.t)} cy={Y(s.last.p)} r="3.5" fill={s.color}>
                  <animate attributeName="opacity" values="1;0.6;1" dur="1.8s" repeatCount="indefinite" />
                </circle>
                <circle cx={X(s.last.t)} cy={Y(s.last.p)} fill="none" stroke={s.color} strokeWidth="2">
                  <animate attributeName="r" values="3.5;10" dur="1.8s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.5;0" dur="1.8s" repeatCount="indefinite" />
                </circle>
              </g>
            ))}
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
      ) : (
        <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
          Not enough trade history in this window yet.
        </div>
      )}

      <div className="mt-1 flex items-center justify-end gap-1">
        {WINDOWS.map(({ label }) => (
          <button
            key={label}
            onClick={() => setWin(label)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
              win === label
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
