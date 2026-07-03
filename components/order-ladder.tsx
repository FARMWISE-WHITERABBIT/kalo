"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatPercent, formatShares } from "@/lib/utils"
import type { Ladder } from "@/lib/orderbook"
import type { Outcome, OrderSide } from "@/lib/types"

// One canonical YES-terms order book — a NO bid at q is shown as a YES ask at
// 1-q, so both outcomes share a single ladder, mirroring the prototype.
export function OrderLadder({
  ladder,
  yesShares,
  onPick = () => {},
}: {
  ladder: Ladder
  yesShares: number
  onPick?: (outcome: Outcome, side: OrderSide, price: number) => void
}) {
  const { bids, asks } = ladder
  const bestBid = bids[0]?.price
  const bestAsk = asks[0]?.price

  return (
    <Card className="py-4">
      <CardHeader className="px-4 pb-2">
        <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
          Order book · YES terms
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <div className="space-y-0.5">
          {asks.length === 0 && <p className="py-1 text-xs text-muted-foreground">No asks.</p>}
          {[...asks]
            .reverse()
            .slice(-6)
            .map((l) => (
              <button
                key={"a" + l.price}
                onClick={() => onPick("YES", "BUY", l.price)}
                title="Buy YES at this price"
                className="flex w-full justify-between rounded bg-no/10 px-2 py-1 font-mono text-xs text-no hover:bg-no/20"
              >
                <span>{formatPercent(l.price)}</span>
                <span className="text-muted-foreground">{formatShares(l.size)}</span>
              </button>
            ))}
        </div>

        <div className="py-1.5 text-center font-mono text-[11px] tracking-wide text-kola">
          {bestBid !== undefined && bestAsk !== undefined
            ? `SPREAD ${Math.round((bestAsk - bestBid) * 100)}¢`
            : "—"}
        </div>

        <div className="space-y-0.5">
          {bids.length === 0 && <p className="py-1 text-xs text-muted-foreground">No bids.</p>}
          {bids.slice(0, 6).map((l) => {
            const sellingYes = yesShares > 0
            return (
              <button
                key={"b" + l.price}
                onClick={() =>
                  sellingYes
                    ? onPick("YES", "SELL", l.price)
                    : onPick("NO", "BUY", Math.min(0.99, Math.max(0.01, 1 - l.price)))
                }
                title={sellingYes ? "Sell YES at this price" : "Buy NO at the complement price"}
                className="flex w-full justify-between rounded bg-yes/10 px-2 py-1 font-mono text-xs text-yes hover:bg-yes/20"
              >
                <span>{formatPercent(l.price)}</span>
                <span className="text-muted-foreground">{formatShares(l.size)}</span>
              </button>
            )
          })}
        </div>

        <p className="mt-2 text-[11px] text-muted-foreground">
          Tap a level to load it into the ticket. NO orders are shown at their YES-equivalent price.
        </p>
      </CardContent>
    </Card>
  )
}
