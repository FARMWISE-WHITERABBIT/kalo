// Larger price-history chart for the market detail page — mirrors the
// prototype's BigChart. `data` is a series of YES prices in the 0..1 range
// (e.g. from trade history); displayed as a 0-100% probability chart.
export function BigChart({ data }: { data: number[] }) {
  const w = 640
  const h = 180
  if (!data || data.length < 2) {
    return (
      <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
        Not enough trade history yet.
      </div>
    )
  }

  const pct = data.map((v) => v * 100)
  const min = Math.max(0, Math.min(...pct) - 5)
  const max = Math.min(100, Math.max(...pct) + 5)
  const rng = Math.max(max - min, 4)
  const X = (i: number) => (i / (pct.length - 1)) * w
  const Y = (v: number) => h - ((v - min) / rng) * (h - 12) - 6
  const pts = pct.map((v, i) => `${X(i)},${Y(v)}`).join(" ")
  const last = pct[pct.length - 1]

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {[25, 50, 75].map((g) =>
        g >= min && g <= max ? (
          <g key={g}>
            <line x1="0" x2={w} y1={Y(g)} y2={Y(g)} stroke="var(--border)" strokeDasharray="3 5" />
            <text x="4" y={Y(g) - 4} fill="var(--muted-foreground)" fontSize="10" className="font-mono">
              {g}%
            </text>
          </g>
        ) : null
      )}
      <polyline points={pts} fill="none" stroke="var(--kola)" strokeWidth="2" />
      <circle cx={X(pct.length - 1)} cy={Y(last)} r="3.5" fill="var(--kola)" />
    </svg>
  )
}
