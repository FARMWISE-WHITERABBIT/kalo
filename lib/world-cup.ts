import type { Database } from "@/lib/types/database"
import type { Market, Trade } from "@/lib/types"
import { tradeYesPrice } from "@/lib/orderbook"

export type Game = Database["public"]["Tables"]["games"]["Row"]

export type MarketKind =
  | "moneyline_home"
  | "moneyline_away"
  | "draw"
  | "spread_home"
  | "total_over"
  | "btts"

export const KIND_ORDER: MarketKind[] = [
  "moneyline_home",
  "draw",
  "moneyline_away",
  "spread_home",
  "total_over",
  "btts",
]

// FIFA trigram → flag emoji. England has no ISO country flag; it uses the
// GB-ENG tag sequence. Anything unmapped falls back to the ball.
const FLAGS: Record<string, string> = {
  ARG: "🇦🇷", BEL: "🇧🇪", BRA: "🇧🇷", CAN: "🇨🇦", COL: "🇨🇴", CRO: "🇭🇷",
  DEN: "🇩🇰", ECU: "🇪🇨", EGY: "🇪🇬", ENG: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", ESP: "🇪🇸", FRA: "🇫🇷",
  GER: "🇩🇪", GHA: "🇬🇭", ITA: "🇮🇹", JPN: "🇯🇵", KOR: "🇰🇷", KSA: "🇸🇦",
  MAR: "🇲🇦", MEX: "🇲🇽", NED: "🇳🇱", NGA: "🇳🇬", NOR: "🇳🇴", POL: "🇵🇱",
  POR: "🇵🇹", QAT: "🇶🇦", SEN: "🇸🇳", SRB: "🇷🇸", SUI: "🇨🇭", TUN: "🇹🇳",
  URU: "🇺🇾", USA: "🇺🇸", WAL: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
}

export function flagFor(code: string): string {
  return FLAGS[code.toUpperCase()] ?? "⚽"
}

export type BoardMarket = {
  id: string
  question: string
  line: number | null
  status: string
  resolvedOutcome: string | null
  /** Last traded price in YES terms; the bootstrap prior applies pre-trade. */
  yesPrice: number | null
}

export type GameBoard = {
  game: Game
  kinds: Partial<Record<MarketKind, BoardMarket>>
}

// Assemble per-game boards from raw rows. `trades` must be sorted newest
// first; the first print per market is its last price.
export function buildGameBoards(games: Game[], markets: Market[], trades: Trade[]): GameBoard[] {
  const lastPrice = new Map<string, number>()
  for (const t of trades) {
    if (!lastPrice.has(t.market_id)) lastPrice.set(t.market_id, tradeYesPrice(t))
  }
  const byGame = new Map<string, GameBoard["kinds"]>()
  for (const m of markets) {
    if (!m.game_id || !m.market_kind) continue
    const kinds = byGame.get(m.game_id) ?? {}
    kinds[m.market_kind as MarketKind] = {
      id: m.id,
      question: m.question,
      line: m.line,
      status: m.status,
      resolvedOutcome: m.resolved_outcome,
      yesPrice: lastPrice.get(m.id) ?? null,
    }
    byGame.set(m.game_id, kinds)
  }
  return games.map((game) => ({ game, kinds: byGame.get(game.id) ?? {} }))
}

export function priceCents(p: number | null): string {
  return p === null ? "—" : `${Math.round(p * 100)}¢`
}

export function kindLabel(kind: MarketKind, game: Game, line?: number | null): string {
  switch (kind) {
    case "moneyline_home":
      return game.home_team
    case "moneyline_away":
      return game.away_team
    case "draw":
      return "Draw"
    case "spread_home":
      return `${game.home_team} −${line ?? 1.5}`
    case "total_over":
      return `Over ${line ?? 2.5}`
    case "btts":
      return "Both teams to score"
  }
}
