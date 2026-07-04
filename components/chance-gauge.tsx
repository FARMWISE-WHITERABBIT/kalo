import { cn } from "@/lib/utils"

// Semicircular "chance" gauge shown on market cards, Polymarket-style.
export function ChanceGauge({ pct, className }: { pct: number; className?: string }) {
  const clamped = Math.min(100, Math.max(0, pct))
  // Arc from (6,30) to (50,30), radius 22 — half-circumference ≈ 69.1
  const arcLength = Math.PI * 22
  const filled = (clamped / 100) * arcLength
  const color = clamped >= 50 ? "var(--yes)" : "var(--no)"

  return (
    <svg viewBox="0 0 56 34" className={cn("w-[52px] shrink-0", className)} aria-hidden="true">
      <path
        d="M6 30 A22 22 0 0 1 50 30"
        fill="none"
        stroke="var(--secondary)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M6 30 A22 22 0 0 1 50 30"
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${arcLength}`}
      />
      <text
        x="28"
        y="26"
        textAnchor="middle"
        fontSize="12.5"
        fontWeight="700"
        fill="var(--foreground)"
      >
        {Math.round(clamped)}%
      </text>
      <text x="28" y="34" textAnchor="middle" fontSize="7" fill="var(--muted-foreground)">
        chance
      </text>
    </svg>
  )
}
