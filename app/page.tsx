import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatCash, formatPercent } from "@/lib/utils"
import type { Market, Trade } from "@/lib/types"

function marketStats(trades: Trade[], marketId: string) {
  const marketTrades = trades.filter((t) => t.market_id === marketId)
  const lastYes = marketTrades.find((t) => t.outcome === "YES")
  const volume = marketTrades.reduce((sum, t) => sum + t.price * t.size, 0)
  return {
    yesPrice: lastYes ? lastYes.price : 0.5,
    volume,
  }
}

export default async function MarketsPage() {
  const supabase = await createClient()

  const [{ data: markets }, { data: trades }] = await Promise.all([
    supabase.from("markets").select("*").order("created_at", { ascending: false }),
    supabase.from("trades").select("*").order("created_at", { ascending: false }),
  ])

  const allMarkets: Market[] = markets ?? []
  const allTrades: Trade[] = trades ?? []

  const openMarkets = allMarkets.filter((m) => m.status === "open")
  const closedMarkets = allMarkets.filter((m) => m.status !== "open")

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Markets</h1>

      {openMarkets.length === 0 && closedMarkets.length === 0 && (
        <p className="text-muted-foreground">No markets yet. Check back soon.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {openMarkets.map((market) => {
          const { yesPrice, volume } = marketStats(allTrades, market.id)
          return (
            <Link key={market.id} href={`/market/${market.id}`}>
              <Card className="h-full transition-colors hover:border-foreground/30">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-snug">{market.question}</CardTitle>
                    <Badge className="shrink-0">{formatPercent(yesPrice)} YES</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{market.category ?? "General"}</span>
                  <span>{formatCash(volume)} vol.</span>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {closedMarkets.length > 0 && (
        <>
          <h2 className="mb-4 mt-10 text-lg font-semibold tracking-tight">Resolved</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {closedMarkets.map((market) => (
              <Link key={market.id} href={`/market/${market.id}`}>
                <Card className="h-full opacity-70 transition-colors hover:opacity-100">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug">{market.question}</CardTitle>
                      {market.resolved_outcome && (
                        <Badge variant="outline" className="shrink-0">
                          Resolved {market.resolved_outcome}
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
  )
}
