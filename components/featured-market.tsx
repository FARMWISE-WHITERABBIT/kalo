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
  // fit the y-domain to the data so movement is visible (min 10pt span)
  let lo = Math.max(0, Math.min(...pct) - 4)
  let hi = Math.min(100, Math.max(...pct) + 4)
  if (hi - lo < 10) {
    const mid = (hi + lo) / 2
    lo = Math.max(0, mid - 5)
    hi = Math.min(100, mid + 5)
  }
  const X = (i: number) => (i / (pct.length - 1)) * (w - 60)
  const Y = (v: number) => h - 24 - ((v - lo) / (hi - lo)) * (h - 40)
  // step-after: a traded price holds until the next print
  let path = `M ${X(0)} ${Y(pct[0])}`
  for (let i = 1; i < pct.length; i++) {
    path += ` H ${X(i)} V ${Y(pct[i])}`
  }
  const last = pct[pct.length - 1]

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="block w-full" style={{ height: "auto" }}>
      {[lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15].map((g, i) => (
        <line
          key={i}
          x1="0"
          x2={w - 60}
          y1={Y(g)}
          y2={Y(g)}
          stroke="var(--border)"
          strokeDasharray="2 6"
        />
      ))}
      <path d={path} fill="none" stroke="var(--chart-2)" strokeWidth="2" strokeLinejoin="round" />
      <circle cx={X(pct.length - 1)} cy={Y(last)} r="4" fill="var(--chart-2)">
        <animate attributeName="opacity" values="1;0.6;1" dur="1.8s" repeatCount="indefinite" />
      </circle>
      <circle cx={X(pct.length - 1)} cy={Y(last)} fill="none" stroke="var(--chart-2)" strokeWidth="2">
        <animate attributeName="r" values="4;11" dur="1.8s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.5;0" dur="1.8s" repeatCount="indefinite" />
      </circle>
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
