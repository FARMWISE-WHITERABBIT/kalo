import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatPercent, formatShares } from "@/lib/utils"
import type { OrderBookLevel, Outcome } from "@/lib/types"

export function OrderBookTable({ outcome, levels }: { outcome: Outcome; levels: OrderBookLevel[] }) {
  const bids = levels.filter((l) => l.side === "BUY").sort((a, b) => b.price - a.price)
  const asks = levels.filter((l) => l.side === "SELL").sort((a, b) => a.price - b.price)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{outcome} order book</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Asks (sell)</p>
          {asks.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
          {asks
            .slice(0, 5)
            .reverse()
            .map((l, i) => (
              <div key={i} className="flex justify-between text-red-600 dark:text-red-400">
                <span>{formatPercent(l.price)}</span>
                <span>{formatShares(l.size)}</span>
              </div>
            ))}
        </div>
        <div className="border-t pt-2">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Bids (buy)</p>
          {bids.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
          {bids.slice(0, 5).map((l, i) => (
            <div key={i} className="flex justify-between text-green-600 dark:text-green-400">
              <span>{formatPercent(l.price)}</span>
              <span>{formatShares(l.size)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
