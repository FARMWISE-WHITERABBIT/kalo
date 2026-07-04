"use client"

import { useState } from "react"
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

function timeLabel(t: number, spanMs: number) {
  const d = new Date(t)
  if (spanMs <= 24 * 60 * 60 * 1000) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

// Market-page price history chart, Polymarket-style: blue line on the page
// background, dashed gridlines with %-labels on the right, timeframe pills.
export function BigChart({ points, meta }: { points: PricePoint[]; meta?: React.ReactNode }) {
  const [win, setWin] = useState("ALL")
  // During SSR the last trade's timestamp anchors the window; the wall clock
  // takes over after hydration.
  const clock = useNow()

  const w = 860
  const h = 300
  const plotW = w - 56
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
  }

  const hasData = data.length >= 2
  const t0 = hasData ? data[0].t : 0
  const t1 = hasData ? data[data.length - 1].t : 1
  const span = Math.max(t1 - t0, 1)
  const X = (t: number) => ((t - t0) / span) * plotW
  const Y = (p: number) => h - 24 - p * (h - 48)
  const pts = data.map((pt) => `${X(pt.t)},${Y(pt.p)}`).join(" ")
  const last = hasData ? data[data.length - 1] : null

  const gridLevels = [0.2, 0.4, 0.6, 0.8]
  const tickTimes = hasData ? [t0, t0 + span / 3, t0 + (2 * span) / 3, t1] : []

  return (
    <div>
      {hasData ? (
        <svg viewBox={`0 0 ${w} ${h}`} className="block w-full" style={{ height: "auto" }}>
          {gridLevels.map((g) => (
            <g key={g}>
              <line
                x1="0"
                x2={plotW}
                y1={Y(g)}
                y2={Y(g)}
                stroke="var(--border)"
                strokeDasharray="2 6"
              />
              <text x={plotW + 12} y={Y(g) + 4} fill="var(--muted-foreground)" fontSize="12">
                {Math.round(g * 100)}%
              </text>
            </g>
          ))}
          {tickTimes.map((t, i) => (
            <text
              key={i}
              x={Math.min(X(t), plotW - 8)}
              y={h - 6}
              fill="var(--muted-foreground)"
              fontSize="11"
              textAnchor={i === 0 ? "start" : "middle"}
            >
              {timeLabel(t, span)}
            </text>
          ))}
          <polyline points={pts} fill="none" stroke="var(--chart-1)" strokeWidth="2" />
          {last && (
            <>
              <circle cx={X(last.t)} cy={Y(last.p)} r="7" fill="var(--chart-1)" opacity="0.25" />
              <circle cx={X(last.t)} cy={Y(last.p)} r="3.5" fill="var(--chart-1)" />
            </>
          )}
        </svg>
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
