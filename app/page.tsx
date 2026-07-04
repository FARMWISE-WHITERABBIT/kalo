import Link from "next/link"
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Flame,
  Search,
  SlidersHorizontal,
} from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { CurrencyAmount } from "@/components/currency-amount"
import { CategoryPills } from "@/components/category-pills"
import { MarketCard, MarketThumb } from "@/components/market-card"
import { FeaturedMarket } from "@/components/featured-market"
import { tradeYesPrice } from "@/lib/orderbook"
import { cn } from "@/lib/utils"
import type { Market, Trade } from "@/lib/types"

function marketStats(trades: Trade[], marketId: string) {
  const marketTrades = trades.filter((t) => t.market_id === marketId)
  const lastTrade = marketTrades[0]
  const volume = marketTrades.reduce((sum, t) => sum + t.price * t.size, 0)
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000
  const volumeToday = marketTrades
    .filter((t) => new Date(t.created_at).getTime() >= dayAgo)
    .reduce((sum, t) => sum + t.price * t.size, 0)
  return {
    yesPrice: lastTrade ? tradeYesPrice(lastTrade) : 0.5,
    volume,
    volumeToday,
  }
}

export default async function MarketsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>
}) {
  const { category, q } = await searchParams
  const supabase = await createClient()

  const [{ data: markets }, { data: trades }] = await Promise.all([
    supabase.from("markets").select("*").order("created_at", { ascending: false }),
    supabase.from("trades").select("*").order("created_at", { ascending: false }),
  ])

  const allMarkets: Market[] = markets ?? []
  const allTrades: Trade[] = trades ?? []

  let filtered = allMarkets
  if (category) filtered = filtered.filter((m) => m.category === category)
  if (q) filtered = filtered.filter((m) => m.question.toLowerCase().includes(q.toLowerCase()))

  const openMarkets = filtered.filter((m) => m.status === "open")
  const closedMarkets = filtered.filter((m) => m.status !== "open")

  const topByVolume = [...allMarkets]
    .filter((m) => m.status === "open")
    .map((m) => ({ m, ...marketStats(allTrades, m.id) }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 5)

  const featured = topByVolume[0]
  const showHero = !category && !q && !!featured
  const featuredSeries = featured
    ? allTrades
        .filter((t) => t.market_id === featured.m.id)
        .reverse()
        .map(tradeYesPrice)
    : []

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      {showHero && (
        <>
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              <FeaturedMarket market={featured.m} yesSeries={featuredSeries} volume={featured.volume} />

              <div className="mt-4 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-1.5">
                  {topByVolume.map(({ m }, i) => (
                    <span
                      key={m.id}
                      className={cn(
                        "h-1.5 rounded-full",
                        i === 0 ? "w-6 bg-muted-foreground" : "w-1.5 bg-secondary"
                      )}
                    />
                  ))}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {topByVolume.slice(1, 3).map(({ m }, i) => (
                    <Link
                      key={m.id}
                      href={`/market/${m.id}`}
                      className="flex h-10 items-center gap-2 rounded-full border border-border/80 px-4 text-sm font-medium text-foreground/90 transition-colors hover:bg-secondary/50"
                    >
                      {i === 0 && <ChevronLeft className="size-4 text-muted-foreground" />}
                      <span className="max-w-52 truncate">{m.question}</span>
                      {i === 1 && <ChevronRight className="size-4 text-muted-foreground" />}
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <aside className="flex flex-col gap-5">
              <div className="rounded-xl border border-border/60 bg-gradient-to-br from-secondary/70 to-card p-4">
                <div className="text-[15px] font-bold">Play money is here</div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    Trade real events with a play-money bankroll
                  </p>
                  <Link
                    href="/signup"
                    className="shrink-0 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    Start trading
                  </Link>
                </div>
              </div>

              <div>
                <Link href="/" className="flex items-center gap-1 text-lg font-bold">
                  Hot topics <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
                <ol className="mt-3 space-y-1">
                  {topByVolume.map(({ m, volume, volumeToday }, i) => (
                    <li key={m.id}>
                      <Link
                        href={`/market/${m.id}`}
                        className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-secondary/40"
                      >
                        <span className="w-4 text-sm text-muted-foreground">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
                          {m.question}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
                          <CurrencyAmount usd={volumeToday || volume} className="text-sm" /> today
                          <Flame className="size-4 text-no" />
                          <ChevronRight className="size-4 opacity-60 group-hover:opacity-100" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>

              <Link
                href="/"
                className="flex h-11 items-center justify-center rounded-full border border-border/80 text-sm font-semibold transition-colors hover:bg-secondary/50"
              >
                Explore all
              </Link>
            </aside>
          </div>
        </>
      )}

      <section className={showHero ? "mt-12" : ""}>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">All markets</h2>
          <div className="flex items-center gap-4 text-muted-foreground">
            <Search className="size-4.5" />
            <SlidersHorizontal className="size-4.5" />
            <Bookmark className="size-4.5" />
          </div>
        </div>

        <div className="mt-4">
          <CategoryPills
            categories={Array.from(
              new Set(allMarkets.map((m) => m.category).filter((c): c is string => !!c))
            ).sort()}
          />
        </div>

        {openMarkets.length === 0 && closedMarkets.length === 0 && (
          <p className="mt-8 text-muted-foreground">No markets match.</p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {openMarkets.map((market) => {
            const { yesPrice, volume } = marketStats(allTrades, market.id)
            return <MarketCard key={market.id} market={market} yesPrice={yesPrice} volume={volume} />
          })}
        </div>

        {closedMarkets.length > 0 && (
          <>
            <h2 className="mb-3 mt-12 text-2xl font-bold tracking-tight">Resolved</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {closedMarkets.map((market) => (
                <Link key={market.id} href={`/market/${market.id}`}>
                  <div className="flex h-full items-start gap-3 rounded-xl border border-border/60 bg-card p-3 opacity-70 transition-opacity hover:opacity-100">
                    <MarketThumb category={market.category} />
                    <div className="min-w-0 flex-1 text-[15px] font-semibold leading-snug">
                      {market.question}
                    </div>
                    {market.resolved_outcome && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0",
                          market.resolved_outcome === "YES" ? "border-yes text-yes" : "border-no text-no"
                        )}
                      >
                        {market.resolved_outcome}
                      </Badge>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </section>

      <section id="how-it-works" className="mt-16 rounded-xl border border-border/60 bg-card p-6">
        <h2 className="text-lg font-bold">How it works</h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-3">
          <div>
            <div className="text-sm font-semibold text-primary">1. Pick a market</div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Play-money contracts on real-world events. Every contract settles at $1 if it resolves
              in your favor, $0 if not.
            </p>
          </div>
          <div>
            <div className="text-sm font-semibold text-primary">2. Buy Yes or No</div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Price = the market&rsquo;s implied probability. Buy the side you believe in, or sell
              when the odds move your way.
            </p>
          </div>
          <div>
            <div className="text-sm font-semibold text-primary">3. Collect on resolution</div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              When the event resolves, winning shares redeem for $1 each — losers fund winners, the
              house carries no risk.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
