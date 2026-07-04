import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CurrencyAmount } from "@/components/currency-amount"
import { tradeYesPrice } from "@/lib/orderbook"
import { categoryColor, categoryInitial } from "@/lib/avatar"
import { cn } from "@/lib/utils"
import type { Market, Trade } from "@/lib/types"

function marketStats(trades: Trade[], marketId: string) {
  const marketTrades = trades.filter((t) => t.market_id === marketId)
  const lastTrade = marketTrades[0]
  const volume = marketTrades.reduce((sum, t) => sum + t.price * t.size, 0)
  return {
    yesPrice: lastTrade ? tradeYesPrice(lastTrade) : 0.5,
    volume,
  }
}

function MarketThumb({ category }: { category: string | null }) {
  return (
    <div
      className="flex size-10 shrink-0 items-center justify-center rounded-lg font-display text-sm font-bold text-white"
      style={{ backgroundColor: categoryColor(category) }}
      aria-hidden="true"
    >
      {categoryInitial(category)}
    </div>
  )
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
    .map((m) => ({ m, volume: marketStats(allTrades, m.id).volume }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 5)

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex gap-8">
        <div className="min-w-0 flex-1">
          <p className="mb-6 max-w-xl text-sm text-muted-foreground">
            Play-money contracts on real-world events. Every contract settles at $1 if it
            resolves in your favor, $0 if not. Price = the market&rsquo;s implied probability.
          </p>

          {openMarkets.length === 0 && closedMarkets.length === 0 && (
            <p className="text-muted-foreground">No markets match.</p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {openMarkets.map((market) => {
              const { yesPrice, volume } = marketStats(allTrades, market.id)
              const yesPct = Math.round(yesPrice * 100)
              const noPct = 100 - yesPct
              return (
                <Card key={market.id} className="gap-0 overflow-hidden py-0 transition-colors hover:border-kola/50">
                  <Link href={`/market/${market.id}`} className="block px-4 pt-4">
                    <div className="flex items-start gap-3">
                      <MarketThumb category={market.category} />
                      <div className="min-w-0 text-sm font-medium leading-snug">{market.question}</div>
                    </div>
                  </Link>

                  <div className="flex gap-2 px-4 pt-3">
                    <Link
                      href={`/market/${market.id}?buy=YES`}
                      className="flex-1 rounded-md bg-yes/10 px-3 py-1.5 text-center font-mono text-sm font-medium text-yes hover:bg-yes/20"
                    >
                      Yes {yesPct}¢
                    </Link>
                    <Link
                      href={`/market/${market.id}?buy=NO`}
                      className="flex-1 rounded-md bg-no/10 px-3 py-1.5 text-center font-mono text-sm font-medium text-no hover:bg-no/20"
                    >
                      No {noPct}¢
                    </Link>
                  </div>

                  <Link
                    href={`/market/${market.id}`}
                    className="flex items-center gap-2 px-4 py-3 text-[11px] text-muted-foreground"
                  >
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                      {market.category ?? "General"}
                    </Badge>
                    <CurrencyAmount usd={volume} className="text-[11px]" />
                    <span>vol.</span>
                  </Link>
                </Card>
              )
            })}
          </div>

          {closedMarkets.length > 0 && (
            <>
              <h2 className="mb-3 mt-10 font-display text-lg font-semibold tracking-tight">Resolved</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {closedMarkets.map((market) => (
                  <Link key={market.id} href={`/market/${market.id}`}>
                    <Card className="h-full gap-3 py-4 opacity-70 transition-colors hover:opacity-100">
                      <div className="flex items-start gap-3 px-4">
                        <MarketThumb category={market.category} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-sm font-medium leading-snug">{market.question}</div>
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
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>

        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-24 rounded-lg border border-border bg-card p-4">
            <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Top by volume
            </div>
            <div className="space-y-3">
              {topByVolume.length === 0 && <p className="text-xs text-muted-foreground">No volume yet.</p>}
              {topByVolume.map(({ m, volume }) => (
                <Link key={m.id} href={`/market/${m.id}`} className="block text-sm hover:text-kola">
                  <div className="line-clamp-2 leading-snug">{m.question}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    <CurrencyAmount usd={volume} className="text-[11px]" /> today
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
