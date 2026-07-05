"use client"

import { useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { useNow } from "@/lib/use-now"

export type PricePoint = { t: number; p: number }

const WINDOWS: { label: string; ms: number | null }[] = [
  { label: "1H", ms: 60 * 60 * 1000 },
  { label: "6H", ms: 6 * 60 * 60 * 1000 },
  { label: "1D", ms: 24 * 60 * 60 * 1000 },
  { label: "1W", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "1M", ms: 30 * 24 * 60 * 60 * 1000 },
  { label: "ALL", ms: null },
]

const W = 860
const H = 300
const PLOT_W = W - 56 // right gutter for % labels
const PLOT_TOP = 10
const PLOT_BOTTOM = H - 26 // bottom gutter for time labels
const MAX_POINTS = 240

function timeLabel(t: number, spanMs: number) {
  const d = new Date(t)
  if (spanMs <= 24 * 60 * 60 * 1000) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function tooltipTime(t: number, spanMs: number) {
  const d = new Date(t)
  if (spanMs <= 24 * 60 * 60 * 1000) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  }
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

// A price axis fitted to the data reads honestly only with round tick values:
// pick the step that yields 3-5 ticks across the domain.
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

// Market-page price chart: step-after line (a traded price holds until the
// next trade), y-domain fitted to the window, time-bucketed downsampling,
// crosshair tooltip, and a pulsing marker on the live price.
export function BigChart({ points, meta }: { points: PricePoint[]; meta?: React.ReactNode }) {
  const [win, setWin] = useState("1D")
  const [hover, setHover] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  // During SSR the last trade's timestamp anchors the window; the wall clock
  // takes over after hydration.
  const clock = useNow()
  const now = clock ?? (points.length ? points[points.length - 1].t : 0)

  const windowMs = WINDOWS.find((x) => x.label === win)?.ms ?? null
  let data = points
  if (windowMs) {
    const cutoff = now - windowMs
    const inWindow = points.filter((pt) => pt.t >= cutoff)
    const pre = points.filter((pt) => pt.t < cutoff)
    // Carry the last pre-window price in, and extend the line to "now", so a
    // quiet window still draws a flat line at the current price.
    const base = pre.length ? [{ t: cutoff, p: pre[pre.length - 1].p }, ...inWindow] : inWindow
    data = base.length ? [...base, { t: now, p: base[base.length - 1].p }] : []
  } else if (points.length) {
    data = [...points, { t: Math.max(now, points[points.length - 1].t), p: points[points.length - 1].p }]
  }

  const hasData = data.length >= 2
  const t0 = hasData ? data[0].t : 0
  const t1 = hasData ? data[data.length - 1].t : 1
  const span = Math.max(t1 - t0, 1)

  // downsample dense windows to the last price per time bucket — keeps the
  // shape without the hairball
  if (data.length > MAX_POINTS) {
    const bucket = span / MAX_POINTS
    const kept: PricePoint[] = [data[0]]
    let currentBucket = 0
    for (let i = 1; i < data.length - 1; i++) {
      const b = Math.floor((data[i].t - t0) / bucket)
      if (b !== currentBucket) {
        kept.push(data[i])
        currentBucket = b
      } else {
        kept[kept.length - 1] = data[i]
      }
    }
    kept.push(data[data.length - 1])
    data = kept
  }

  // y-domain fitted to the window (min 10pt span, 8% padding, clamped 0..1)
  let lo = 0
  let hi = 1
  if (hasData) {
    const vals = data.map((d) => d.p)
    lo = Math.min(...vals)
    hi = Math.max(...vals)
    const pad = Math.max((hi - lo) * 0.08, 0.02)
    lo = Math.max(0, lo - pad)
    hi = Math.min(1, hi + pad)
    if (hi - lo < 0.1) {
      const mid = (hi + lo) / 2
      lo = Math.max(0, mid - 0.05)
      hi = Math.min(1, mid + 0.05)
    }
  }

  const X = (t: number) => ((t - t0) / span) * PLOT_W
  const Y = (p: number) => PLOT_BOTTOM - ((p - lo) / (hi - lo)) * (PLOT_BOTTOM - PLOT_TOP)

  // step-after path: price holds until the next trade
  let linePath = ""
  if (hasData) {
    linePath = `M ${X(data[0].t)} ${Y(data[0].p)}`
    for (let i = 1; i < data.length; i++) {
      linePath += ` H ${X(data[i].t)} V ${Y(data[i].p)}`
    }
  }
  const areaPath = hasData
    ? `${linePath} V ${PLOT_BOTTOM} H ${X(data[0].t)} Z`
    : ""

  const last = hasData ? data[data.length - 1] : null
  const ticks = hasData ? niceTicks(lo, hi) : []
  const tickTimes = hasData ? [t0, t0 + span / 3, t0 + (2 * span) / 3, t1] : []
  const hovered = hover !== null && hover < data.length ? data[hover] : null

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!hasData || !wrapRef.current) return
    const rect = wrapRef.current.getBoundingClientRect()
    const vx = ((e.clientX - rect.left) / rect.width) * W
    if (vx < 0 || vx > PLOT_W) {
      setHover(null)
      return
    }
    const t = t0 + (vx / PLOT_W) * span
    // nearest point by time (data is chronological)
    let lft = 0
    let rgt = data.length - 1
    while (rgt - lft > 1) {
      const mid = (lft + rgt) >> 1
      if (data[mid].t < t) lft = mid
      else rgt = mid
    }
    setHover(t - data[lft].t <= data[rgt].t - t ? lft : rgt)
  }

  return (
    <div>
      {hasData ? (
        <div
          ref={wrapRef}
          className="relative cursor-crosshair"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHover(null)}
        >
          <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ height: "auto" }}>
            <defs>
              <linearGradient id="kalo-chart-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.16" />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {ticks.map((g) => (
              <g key={g}>
                <line
                  x1="0"
                  x2={PLOT_W}
                  y1={Y(g)}
                  y2={Y(g)}
                  stroke="var(--border)"
                  strokeDasharray="2 6"
                />
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
                {timeLabel(t, span)}
              </text>
            ))}

            <path d={areaPath} fill="url(#kalo-chart-fill)" />
            <path
              d={linePath}
              fill="none"
              stroke="var(--chart-1)"
              strokeWidth="2"
              strokeLinejoin="round"
            />

            {/* crosshair: the hairline finds the X, the dot marks the value */}
            {hovered && (
              <g>
                <line
                  x1={X(hovered.t)}
                  x2={X(hovered.t)}
                  y1={PLOT_TOP}
                  y2={PLOT_BOTTOM}
                  stroke="var(--muted-foreground)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  opacity="0.6"
                />
                <circle
                  cx={X(hovered.t)}
                  cy={Y(hovered.p)}
                  r="5"
                  fill="var(--chart-1)"
                  stroke="var(--card)"
                  strokeWidth="2"
                />
              </g>
            )}

            {/* live price marker: solid dot + pulsing ring */}
            {last && (
              <g>
                <circle cx={X(last.t)} cy={Y(last.p)} r="4" fill="var(--chart-1)">
                  <animate
                    attributeName="opacity"
                    values="1;0.6;1"
                    dur="1.8s"
                    repeatCount="indefinite"
                  />
                </circle>
                <circle
                  cx={X(last.t)}
                  cy={Y(last.p)}
                  fill="none"
                  stroke="var(--chart-1)"
                  strokeWidth="2"
                >
                  <animate attributeName="r" values="4;12" dur="1.8s" repeatCount="indefinite" />
                  <animate
                    attributeName="opacity"
                    values="0.55;0"
                    dur="1.8s"
                    repeatCount="indefinite"
                  />
                </circle>
              </g>
            )}
          </svg>

          {/* tooltip: value leads, time follows; flips side near the right edge */}
          {hovered && (
            <div
              className="pointer-events-none absolute z-10 -translate-y-full rounded-lg border border-border/60 bg-popover px-3 py-1.5 shadow-lg"
              style={{
                left: `${(X(hovered.t) / W) * 100}%`,
                top: `${(Y(hovered.p) / H) * 100}%`,
                transform:
                  X(hovered.t) / PLOT_W > 0.78
                    ? "translate(calc(-100% - 10px), calc(-100% - 8px))"
                    : "translate(10px, calc(-100% - 8px))",
              }}
            >
              <div className="flex items-center gap-2 whitespace-nowrap">
                <span className="h-0.5 w-3 rounded-full" style={{ background: "var(--chart-1)" }} />
                <span className="text-sm font-bold tabular-nums">
                  {Math.round(hovered.p * 100)}% Yes
                </span>
              </div>
              <div className="whitespace-nowrap text-xs text-muted-foreground">
                {tooltipTime(hovered.t, span)}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
          Not enough trade history in this window yet.
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3 text-sm text-muted-foreground">{meta}</div>
        <div className="flex items-center gap-1">
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
    </div>
  )
}
