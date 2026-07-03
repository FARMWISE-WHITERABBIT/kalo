// Small inline sparkline, no charting library — mirrors the prototype's Spark
// component. `data` is a series of prices in the 0..1 range (or any scale;
// min/max are derived from the data itself).
export function Spark({
  data,
  w = 120,
  h = 34,
  color = "var(--kola)",
}: {
  data: number[]
  w?: number
  h?: number
  color?: string
}) {
  if (!data || data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const rng = Math.max(max - min, 0.02)
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / rng) * (h - 4) - 2}`)
    .join(" ")

  return (
    <svg width={w} height={h} style={{ display: "block" }} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  )
}
