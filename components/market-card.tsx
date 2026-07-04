import Link from "next/link"
import { Gift, Bookmark } from "lucide-react"
import { CurrencyAmount } from "@/components/currency-amount"
import { ChanceGauge } from "@/components/chance-gauge"
import { categoryColor, categoryInitial } from "@/lib/avatar"
import type { Market } from "@/lib/types"

export function MarketThumb({
  category,
  size = 40,
  className,
}: {
  category: string | null
  size?: number
  className?: string
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-lg font-bold text-white ${className ?? ""}`}
      style={{
        backgroundColor: categoryColor(category),
        width: size,
        height: size,
        fontSize: size * 0.4,
      }}
      aria-hidden="true"
    >
      {categoryInitial(category)}
    </div>
  )
}

export function MarketCard({
  market,
  yesPrice,
  volume,
}: {
  market: Market
  yesPrice: number
  volume: number
}) {
  const yesPct = Math.round(yesPrice * 100)
  const noPct = 100 - yesPct

  return (
    <div className="flex flex-col rounded-xl border border-border/60 bg-card p-3 transition-colors hover:border-muted-foreground/40">
      <Link href={`/market/${market.id}`} className="flex items-start gap-3">
        <MarketThumb category={market.category} />
        <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug">
          <span className="line-clamp-2">{market.question}</span>
        </span>
        <ChanceGauge pct={yesPct} />
      </Link>

      <div className="mt-3 flex gap-2">
        <Link
          href={`/market/${market.id}?buy=YES`}
          className="group flex h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-yes/15 text-sm font-semibold text-yes transition-colors hover:bg-yes hover:text-white"
        >
          Yes <span className="text-yes/70 group-hover:text-white/80">{yesPct}&cent;</span>
        </Link>
        <Link
          href={`/market/${market.id}?buy=NO`}
          className="group flex h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-no/15 text-sm font-semibold text-no transition-colors hover:bg-no hover:text-white"
        >
          No <span className="text-no/70 group-hover:text-white/80">{noPct}&cent;</span>
        </Link>
      </div>

      <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
        <CurrencyAmount usd={volume} className="text-xs" />
        <span>Vol.</span>
        <span className="ml-auto flex items-center gap-2.5">
          <Gift className="size-4 transition-colors hover:text-foreground" />
          <Bookmark className="size-4 transition-colors hover:text-foreground" />
        </span>
      </div>
    </div>
  )
}
