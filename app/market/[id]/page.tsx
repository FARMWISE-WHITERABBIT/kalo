import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CurrencyAmount } from "@/components/currency-amount"
import { OrderLadder } from "@/components/order-ladder"
import { BigChart } from "@/components/big-chart"
import { toYesLadder, tradeYesPrice } from "@/lib/orderbook"
import { formatShares, formatTradeKind } from "@/lib/utils"
import type { OrderBookLevel, Trade, Position, Outcome } from "@/lib/types"
import { RealtimeRefresher } from "./realtime-refresher"
import { MarketWorkspace } from "./market-workspace"
import { SplitMergePanel } from "./split-merge-panel"
import { RedeemPanel } from "./redeem-panel"
import { ResolveMarketButtons } from "@/app/admin/resolve-market-buttons"

export default async function MarketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ buy?: string }>
}) {
  const { id } = await params
  const { buy } = await searchParams
  const initialOutcome: Outcome = buy === "NO" ? "NO" : "YES"
  const supabase = await createClient()

  const [{ data: market }, { data: bookRows }, { data: trades }, {
    data: { user },
  }] = await Promise.all([
    supabase.from("markets").select("*").eq("id", id).single(),
    supabase.rpc("get_order_book", { p_market_id: id }),
    supabase.from("trades").select("*").eq("market_id", id).order("created_at", { ascending: false }).limit(30),
    supabase.auth.getUser(),
  ])

  if (!market) {
    notFound()
  }

  let balance = 0
  let positions: Position[] = []
  let isAdmin = false
  if (user) {
    const [{ data: profile }, { data: pos }] = await Promise.all([
      supabase.from("profiles").select("balance, is_admin").eq("id", user.id).single(),
      supabase.from("positions").select("*").eq("market_id", id).eq("user_id", user.id),
    ])
    balance = profile?.balance ?? 0
    isAdmin = profile?.is_admin ?? false
    positions = pos ?? []
  }

  const book: OrderBookLevel[] = bookRows ?? []
  const marketTrades: Trade[] = trades ?? []
  const ladder = toYesLadder(book)
  const chronological = [...marketTrades].reverse().map(tradeYesPrice)
  const yesPrice = marketTrades[0] ? tradeYesPrice(marketTrades[0]) : 0.5

  const yesShares = positions.find((p) => p.outcome === "YES")?.shares ?? 0
  const noShares = positions.find((p) => p.outcome === "NO")?.shares ?? 0
  const resolvedOutcome = market.resolved_outcome as Outcome | null
  const isOpen = market.status === "open"

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {isOpen && <RealtimeRefresher marketId={id} />}

      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="secondary">{market.category ?? "General"}</Badge>
            {market.status === "resolved" && (
              <Badge
                variant="outline"
                className={resolvedOutcome === "YES" ? "border-yes text-yes" : "border-no text-no"}
              >
                RESOLVED {resolvedOutcome}
              </Badge>
            )}
          </div>
          <h1 className="font-display text-xl font-semibold leading-snug tracking-tight">
            {market.question}
          </h1>
          {market.description && <p className="mt-2 text-sm text-muted-foreground">{market.description}</p>}
          {market.close_at && (
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              Closes {new Date(market.close_at).toLocaleDateString()}
            </p>
          )}
        </div>
        <div className="text-right">
          <div className="font-mono text-4xl font-semibold leading-none text-kola">
            {Math.round(yesPrice * 100)}
            <span className="text-xl">%</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">implied probability</div>
        </div>
      </div>

      <Card className="mb-4 py-4">
        <CardContent className="px-4">
          <BigChart data={chronological} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {user && isOpen ? (
          <MarketWorkspace
            marketId={id}
            ladder={ladder}
            yesShares={yesShares}
            noShares={noShares}
            initialOutcome={initialOutcome}
          />
        ) : (
          <>
            <OrderLadder ladder={ladder} yesShares={yesShares} />
            <Card className="py-4">
              <CardContent className="px-4 text-sm text-muted-foreground">
                {!user ? "Log in to trade this market." : "This market is resolved — trading is closed."}
              </CardContent>
            </Card>
          </>
        )}

        <div className="space-y-4">
          <Card className="py-4">
            <CardHeader className="px-4 pb-2">
              <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Tape</CardTitle>
            </CardHeader>
            <CardContent className="max-h-64 overflow-y-auto px-4">
              {marketTrades.length === 0 && <p className="text-xs text-muted-foreground">No trades yet.</p>}
              <div className="space-y-1">
                {marketTrades.map((t) => (
                  <div key={t.id} className="flex items-center justify-between font-mono text-xs">
                    <span>
                      {Math.round(tradeYesPrice(t) * 100)}% × {formatShares(t.size)}
                    </span>
                    <span className="text-muted-foreground">{formatTradeKind(t.kind)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {user && isOpen && <SplitMergePanel marketId={id} balance={balance} yesShares={yesShares} noShares={noShares} />}
          {user && !isOpen && market.status === "resolved" && (
            <RedeemPanel marketId={id} outcome={resolvedOutcome} yesShares={yesShares} noShares={noShares} />
          )}

          {isAdmin && isOpen && (
            <Card className="py-4">
              <CardHeader className="px-4 pb-2">
                <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Admin</CardTitle>
              </CardHeader>
              <CardContent className="px-4">
                <ResolveMarketButtons marketId={id} question={market.question} />
              </CardContent>
            </Card>
          )}

          {user && (yesShares > 0 || noShares > 0) && (
            <Card className="py-4">
              <CardHeader className="px-4 pb-2">
                <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
                  Your position
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 px-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-yes">YES shares</span>
                  <span className="font-mono">{formatShares(yesShares)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-no">NO shares</span>
                  <span className="font-mono">{formatShares(noShares)}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <details className="mt-6 group">
        <summary className="cursor-pointer text-xs font-medium text-kola">
          Under the hood — how settlement works
        </summary>
        <div className="mt-3 max-w-2xl space-y-3 rounded-lg border border-border bg-card p-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            Kalo keeps one canonical order book per market, in YES terms — a bid to buy NO at{" "}
            <CurrencyAmount usd={0.4} className="text-foreground" /> is the same thing as an ask on YES at
            the complement price, so both sides share one book and one spread.
          </p>
          <p>
            The matching engine runs price-time priority and settles each cross one of four ways:{" "}
            <em>transfer</em> (a buyer and seller of the same outcome swap existing contracts),{" "}
            <em>mint</em> (a YES buyer and a NO buyer whose prices sum to at least $1 jointly fund a new
            contract pair), and <em>merge</em> (a YES seller and a NO seller surrender a pair, burned for
            the $1 collateral split between them). The tape above labels each print with its settlement type.
          </p>
          <p className="mb-0">
            Every contract pair is fully collateralized in Postgres at creation — the house never carries
            outcome risk. Losers fund winners.
          </p>
        </div>
      </details>
    </div>
  )
}
