import type { OrderBookLevel, Outcome } from "@/lib/types"

export type LadderLevel = { price: number; size: number }
export type Ladder = { bids: LadderLevel[]; asks: LadderLevel[] }

// Unifies the two-outcome order book into one canonical YES-terms ladder —
// a NO bid at q is the same economic position as a YES ask at 1-q, so both
// sides share one book. Mirrors the prototype's `ladder()` / `yesBidPx` /
// `yesAskPx` helpers.
export function toYesLadder(levels: OrderBookLevel[]): Ladder {
  const bids = new Map<number, number>()
  const asks = new Map<number, number>()

  for (const l of levels) {
    if (l.outcome === "YES" && l.side === "BUY") {
      bids.set(l.price, (bids.get(l.price) ?? 0) + l.size)
    } else if (l.outcome === "NO" && l.side === "SELL") {
      const p = round2(1 - l.price)
      bids.set(p, (bids.get(p) ?? 0) + l.size)
    } else if (l.outcome === "YES" && l.side === "SELL") {
      asks.set(l.price, (asks.get(l.price) ?? 0) + l.size)
    } else if (l.outcome === "NO" && l.side === "BUY") {
      const p = round2(1 - l.price)
      asks.set(p, (asks.get(p) ?? 0) + l.size)
    }
  }

  return {
    bids: [...bids.entries()].map(([price, size]) => ({ price, size })).sort((a, b) => b.price - a.price),
    asks: [...asks.entries()].map(([price, size]) => ({ price, size })).sort((a, b) => a.price - b.price),
  }
}

// Converts a trade's recorded price (which is in terms of whichever outcome
// the taker traded) into a YES-equivalent price for charting.
export function tradeYesPrice(trade: { outcome: Outcome | string; price: number }): number {
  return trade.outcome === "YES" ? trade.price : round2(1 - trade.price)
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}
