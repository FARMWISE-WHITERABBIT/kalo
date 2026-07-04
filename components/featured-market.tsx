import Link from "next/link"
import { CurrencyAmount } from "@/components/currency-amount"
import { MarketThumb } from "@/components/market-card"
import { LogoMark } from "@/components/logo"
import type { Market } from "@/lib/types"

function Sparkline({ data }: { data: number[] }) {
  const w = 560
  const h = 190
  if (data.length < 2) {
    return (
      <div className="flex h-[190px] items-center justify-center text-sm text-muted-foreground">
        Not enough trade history yet.
      </div>
    )
  }
  const pct = data.map((v) => v * 100)
  const X = (i: number) => (i / (pct.length - 1)) * (w - 60)
  const Y = (v: number) => h - 24 - (v / 100) * (h - 40)
  const pts = pct.map((v, i) => `${X(i)},${Y(v)}`).join(" ")
  const last = pct[pct.length - 1]

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="block w-full" style={{ height: "auto" }}>
      {[0, 30, 60].map((g) => (
        <line
          key={g}
          x1="0"
          x2={w - 60}
          y1={Y(g)}
          y2={Y(g)}
          stroke="var(--border)"
          strokeDasharray="2 6"
        />
      ))}
      <polyline points={pts} fill="none" stroke="var(--chart-2)" strokeWidth="2" />
      <circle cx={X(pct.length - 1)} cy={Y(last)} r="4" fill="var(--chart-2)" />
      <text
        x={X(pct.length - 1) + 10}
        y={Y(last) - 8}
        fill="var(--chart-2)"
        fontSize="13"
        fontWeight="600"
      >
        Yes
      </text>
      <text
        x={X(pct.length - 1) + 10}
        y={Y(last) + 10}
        fill="var(--chart-2)"
        fontSize="17"
        fontWeight="700"
      >
        {Math.round(last)}%
      </text>
    </svg>
  )
}

export function FeaturedMarket({
  market,
  yesSeries,
  volume,
}: {
  market: Market
  yesSeries: number[]
  volume: number
}) {
  const last = yesSeries.length ? yesSeries[yesSeries.length - 1] : 0.5
  const yesPct = Math.round(last * 100)

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{market.category ?? "General"}</span>
            <span aria-hidden="true">&middot;</span>
            <span>Featured</span>
          </div>
          <Link href={`/market/${market.id}`} className="mt-1 block hover:text-primary">
            <h2 className="text-2xl font-bold leading-snug tracking-tight sm:text-[28px]">
              {market.question}
            </h2>
          </Link>
        </div>
        <MarketThumb category={market.category} size={56} className="rounded-xl" />
      </div>

      <div className="mt-4 flex gap-2">
        <Link
          href={`/market/${market.id}?buy=YES`}
          className="flex h-11 w-40 items-center justify-center rounded-lg border border-yes/40 bg-yes/10 text-sm font-semibold text-yes transition-colors hover:bg-yes hover:text-white"
        >
          Yes {yesPct}&cent;
        </Link>
        <Link
          href={`/market/${market.id}?buy=NO`}
          className="flex h-11 w-40 items-center justify-center rounded-lg border border-no/40 bg-no/10 text-sm font-semibold text-no transition-colors hover:bg-no hover:text-white"
        >
          No {100 - yesPct}&cent;
        </Link>
      </div>

      <div className="mt-4">
        <Sparkline data={yesSeries} />
      </div>

      <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          <CurrencyAmount usd={volume} className="text-sm" /> Vol
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground/70">
          <LogoMark className="size-4" /> Kalo
        </span>
      </div>
    </div>
  )
}
