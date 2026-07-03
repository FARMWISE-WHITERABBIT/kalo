import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CurrencyAmount } from "@/components/currency-amount"
import { Spark } from "@/components/spark"
import { tradeYesPrice } from "@/lib/orderbook"
import type { Market, Trade } from "@/lib/types"

function marketStats(trades: Trade[], marketId: string) {
  const marketTrades = trades.filter((t) => t.market_id === marketId)
  const chronological = [...marketTrades].reverse() // trades are fetched newest-first
  const lastTrade = marketTrades[0]
  const volume = marketTrades.reduce((sum, t) => sum + t.price * t.size, 0)
  return {
    yesPrice: lastTrade ? tradeYesPrice(lastTrade) : 0.5,
    volume,
    history: chronological.map(tradeYesPrice),
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
              const { yesPrice, volume, history } = marketStats(allTrades, market.id)
              return (
                <Link key={market.id} href={`/market/${market.id}`}>
                  <Card className="h-full gap-3 py-4 transition-colors hover:border-kola/50">
                    <CardHeader className="px-4">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-sm font-medium leading-snug">{market.question}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4">
                      <div className="flex items-end justify-between gap-2">
                        <div>
                          <div className="font-mono text-2xl font-semibold text-kola">
                            {Math.round(yesPrice * 100)}
                            <span className="text-sm">%</span>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                              {market.category ?? "General"}
                            </Badge>
                            <CurrencyAmount usd={volume} className="text-[11px]" /> vol.
                          </div>
                        </div>
                        <Spark data={history.length >= 2 ? history.slice(-40) : [yesPrice, yesPrice]} />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>

          {closedMarkets.length > 0 && (
            <>
              <h2 className="mb-3 mt-10 text-lg font-semibold tracking-tight">Resolved</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {closedMarkets.map((market) => (
                  <Link key={market.id} href={`/market/${market.id}`}>
                    <Card className="h-full gap-3 py-4 opacity-70 transition-colors hover:opacity-100">
                      <CardHeader className="px-4">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-sm font-medium leading-snug">{market.question}</CardTitle>
                          {market.resolved_outcome && (
                            <Badge
                              variant="outline"
                              className={
                                market.resolved_outcome === "YES"
                                  ? "shrink-0 border-yes text-yes"
                                  : "shrink-0 border-no text-no"
                              }
                            >
                              {market.resolved_outcome}
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
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
