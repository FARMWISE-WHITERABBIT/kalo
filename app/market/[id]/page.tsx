import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatPercent, formatShares } from "@/lib/utils"
import type { OrderBookLevel, Trade, Position, Outcome } from "@/lib/types"
import { RealtimeRefresher } from "./realtime-refresher"
import { OrderBookTable } from "./order-book-table"
import { TradePanel } from "./trade-panel"
import { SplitMergePanel } from "./split-merge-panel"
import { RedeemPanel } from "./redeem-panel"

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: market }, { data: bookRows }, { data: trades }, {
    data: { user },
  }] = await Promise.all([
    supabase.from("markets").select("*").eq("id", id).single(),
    supabase.rpc("get_order_book", { p_market_id: id }),
    supabase.from("trades").select("*").eq("market_id", id).order("created_at", { ascending: false }).limit(20),
    supabase.auth.getUser(),
  ])

  if (!market) {
    notFound()
  }

  let balance = 0
  let positions: Position[] = []
  if (user) {
    const [{ data: profile }, { data: pos }] = await Promise.all([
      supabase.from("profiles").select("balance").eq("id", user.id).single(),
      supabase.from("positions").select("*").eq("market_id", id).eq("user_id", user.id),
    ])
    balance = profile?.balance ?? 0
    positions = pos ?? []
  }

  const book: OrderBookLevel[] = bookRows ?? []
  const marketTrades: Trade[] = trades ?? []
  const yesLevels = book.filter((b) => b.outcome === "YES")
  const noLevels = book.filter((b) => b.outcome === "NO")
  const lastYesTrade = marketTrades.find((t) => t.outcome === "YES")
  const yesPrice = lastYesTrade ? lastYesTrade.price : 0.5

  const yesShares = positions.find((p) => p.outcome === "YES")?.shares ?? 0
  const noShares = positions.find((p) => p.outcome === "NO")?.shares ?? 0
  const resolvedOutcome = market.resolved_outcome as Outcome | null

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {market.status === "open" && <RealtimeRefresher marketId={id} />}

      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{market.question}</h1>
          <Badge>{formatPercent(yesPrice)} YES</Badge>
          {market.status === "resolved" && (
            <Badge variant="outline">Resolved: {market.resolved_outcome}</Badge>
          )}
        </div>
        {market.description && <p className="mt-2 text-muted-foreground">{market.description}</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <OrderBookTable outcome="YES" levels={yesLevels} />
            <OrderBookTable outcome="NO" levels={noLevels} />
          </div>

          <div>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">Recent trades</h2>
            <div className="divide-y rounded-md border">
              {marketTrades.length === 0 && (
                <p className="p-3 text-sm text-muted-foreground">No trades yet.</p>
              )}
              {marketTrades.map((t) => (
                <div key={t.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>
                    {t.outcome} @ {formatPercent(t.price)}
                  </span>
                  <span className="text-muted-foreground">{formatShares(t.size)} shares</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {!user && (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">Log in to trade.</CardContent>
            </Card>
          )}

          {user && market.status === "open" && (
            <>
              <TradePanel marketId={id} yesShares={yesShares} noShares={noShares} />
              <SplitMergePanel marketId={id} balance={balance} yesShares={yesShares} noShares={noShares} />
            </>
          )}

          {user && market.status === "resolved" && (
            <RedeemPanel marketId={id} outcome={resolvedOutcome} yesShares={yesShares} noShares={noShares} />
          )}

          {user && (yesShares > 0 || noShares > 0) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Your position</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>YES shares</span>
                  <span>{formatShares(yesShares)}</span>
                </div>
                <div className="flex justify-between">
                  <span>NO shares</span>
                  <span>{formatShares(noShares)}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
