import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronRight, Clock, Trophy } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { CurrencyAmount } from "@/components/currency-amount"
import { Countdown } from "@/components/world-cup/countdown"
import { type GameSeries } from "@/components/world-cup/game-chart"
import { GameWorkspace, type BoardSection, type GameTapeEntry } from "./game-workspace"
import { toYesLadder, tradeYesPrice, type Ladder } from "@/lib/orderbook"
import {
  buildGameBoards,
  flagFor,
  kindLabel,
  priceCents,
  type Game,
  type MarketKind,
} from "@/lib/world-cup"
import type { Market, OrderBookLevel, Trade } from "@/lib/types"

const SERIES_COLORS = ["var(--chart-1)", "var(--chart-4)", "var(--chart-3)"]

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: game }, { data: markets }, { data: { user } }] = await Promise.all([
    supabase.from("games").select("*").eq("id", id).single(),
    supabase.from("markets").select("*").eq("game_id", id),
    supabase.auth.getUser(),
  ])

  if (!game) notFound()
  const g: Game = game
  const gameMarkets: Market[] = markets ?? []
  const marketIds = gameMarkets.map((m) => m.id)

  // trades (chart + tape), order books (trade ticket), user positions
  const [tradesRes, bookResults, positionsRes] = await Promise.all([
    marketIds.length
      ? supabase
          .from("trades")
          .select("*")
          .in("market_id", marketIds)
          .order("created_at", { ascending: false })
          .limit(1500)
      : Promise.resolve({ data: [] as Trade[] }),
    Promise.all(
      gameMarkets.map((m) =>
        supabase.rpc("get_order_book", { p_market_id: m.id }).then(({ data }) => ({
          marketId: m.id,
          book: (data ?? []) as OrderBookLevel[],
        }))
      )
    ),
    user && marketIds.length
      ? supabase.from("positions").select("*").eq("user_id", user.id).in("market_id", marketIds)
      : Promise.resolve({ data: [] }),
  ])
  const trades: Trade[] = tradesRes.data ?? []

  const ladders: Record<string, Ladder> = {}
  for (const r of bookResults) ladders[r.marketId] = toYesLadder(r.book)

  const positions: Record<string, { yes: number; no: number }> = {}
  for (const p of positionsRes.data ?? []) {
    const cur = positions[p.market_id] ?? { yes: 0, no: 0 }
    if (p.outcome === "YES") cur.yes = p.shares
    else cur.no = p.shares
    positions[p.market_id] = cur
  }

  const board = buildGameBoards([g], gameMarkets, trades)[0]
  const kinds = board.kinds

  // three moneyline series for the chart, oldest → newest
  const mlSpecs: { kind: MarketKind; label: string }[] = [
    { kind: "moneyline_home", label: g.home_team },
    { kind: "moneyline_away", label: g.away_team },
    { kind: "draw", label: "Draw" },
  ]
  const series: GameSeries[] = mlSpecs.flatMap((spec, i) => {
    const m = kinds[spec.kind]
    if (!m) return []
    const pts = trades
      .filter((t) => t.market_id === m.id)
      .reverse()
      .map((t) => ({ t: new Date(t.created_at).getTime(), p: tradeYesPrice(t) }))
    return [{ key: spec.kind as string, label: spec.label, color: SERIES_COLORS[i], points: pts }]
  })

  const volume = trades.filter((t) => !t.is_seed).reduce((sum, t) => sum + t.price * t.size, 0)

  const bothFlags = `${flagFor(g.home_code)}${flagFor(g.away_code)}`
  const rowFor = (kind: MarketKind, flag: string) => {
    const m = kinds[kind]
    if (!m) return []
    return [
      {
        kind: kind as string,
        marketId: m.id,
        label: kindLabel(kind, g, m.line),
        flag,
        question: m.question,
        yesPrice: m.yesPrice,
        status: m.status,
        resolvedOutcome: m.resolvedOutcome,
      },
    ]
  }
  const sections: BoardSection[] = [
    {
      title: "Moneyline",
      rows: [
        ...rowFor("moneyline_home", flagFor(g.home_code)),
        ...rowFor("draw", bothFlags),
        ...rowFor("moneyline_away", flagFor(g.away_code)),
      ],
    },
    { title: "Spread", rows: rowFor("spread_home", flagFor(g.home_code)) },
    { title: "Total goals", rows: rowFor("total_over", bothFlags) },
    { title: "Props", rows: rowFor("btts", bothFlags) },
  ]

  const labelByMarket = new Map(sections.flatMap((s) => s.rows.map((r) => [r.marketId, r.label])))
  const tape: GameTapeEntry[] = trades.slice(0, 25).map((t) => ({
    id: t.id,
    label: labelByMarket.get(t.market_id) ?? "",
    outcome: t.outcome,
    priceCents: Math.round(t.price * 100),
    amount: t.price * t.size,
    createdAt: t.created_at,
  }))
  // everything rendered server-side is "seen" — toasts only fire for new prints
  const seenTradeIds = trades.slice(0, 80).map((t) => t.id)

  // right rail: the rest of the slate
  const { data: otherGames } = await supabase
    .from("games")
    .select("*")
    .neq("id", id)
    .neq("status", "finished")
    .order("kickoff_at", { ascending: true })
    .limit(6)
  const rail: Game[] = otherGames ?? []
  let railBoards: ReturnType<typeof buildGameBoards> = []
  if (rail.length > 0) {
    const { data: railMarkets } = await supabase
      .from("markets")
      .select("*")
      .in("game_id", rail.map((x) => x.id))
      .in("market_kind", ["moneyline_home", "moneyline_away"])
    const railIds = (railMarkets ?? []).map((m) => m.id)
    const { data: railTrades } = railIds.length
      ? await supabase
          .from("trades")
          .select("*")
          .in("market_id", railIds)
          .order("created_at", { ascending: false })
          .limit(400)
      : { data: [] }
    railBoards = buildGameBoards(rail, railMarkets ?? [], railTrades ?? [])
  }

  const sidebarExtras = (
    <>
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <div className="text-[15px] font-semibold">More FIFA World Cup games</div>
        <div className="mt-1 divide-y divide-border/40">
          {railBoards.map(({ game: rg, kinds: rk }) => (
            <Link key={rg.id} href={`/world-cup/${rg.id}`} className="group block py-2.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {new Date(rg.kickoff_at).toLocaleString(undefined, {
                    weekday: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                <span>{rg.stage}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-base" aria-hidden="true">
                  {flagFor(rg.home_code)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium group-hover:text-primary">
                  {rg.home_team} vs {rg.away_team}
                </span>
                <span className="text-base" aria-hidden="true">
                  {flagFor(rg.away_code)}
                </span>
              </div>
              <div className="mt-1 flex gap-3 text-xs tabular-nums text-muted-foreground">
                <span>
                  {rg.home_code} {priceCents(rk.moneyline_home?.yesPrice ?? null)}
                </span>
                <span>
                  {rg.away_code} {priceCents(rk.moneyline_away?.yesPrice ?? null)}
                </span>
              </div>
            </Link>
          ))}
          {railBoards.length === 0 && (
            <p className="py-2.5 text-sm text-muted-foreground">No other games scheduled.</p>
          )}
        </div>
        <Link
          href="/world-cup"
          className="mt-2 flex h-10 items-center justify-center rounded-lg border border-border/80 text-sm font-semibold transition-colors hover:bg-secondary/50"
        >
          View all games
        </Link>
      </div>

      <div className="rounded-xl border border-border/60 bg-gradient-to-br from-secondary/70 to-card p-4">
        <div className="text-sm font-bold">Play money, real markets</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Every option on this page is a fully-collateralized Yes/No market on Kalo&rsquo;s
          exchange. All game markets settle on regulation time (90 minutes plus stoppage) per
          the official FIFA match report — extra time and penalties don&rsquo;t count.
        </p>
      </div>
    </>
  )

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/world-cup" className="hover:text-foreground">
          World Cup
        </Link>
        <ChevronRight className="size-3.5" />
        <span>{g.stage}</span>
      </div>

      {/* match header */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-4xl" aria-hidden="true">
            <span>{flagFor(g.home_code)}</span>
            <span>{flagFor(g.away_code)}</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {g.home_team} – {g.away_team}
            </h1>
            <div className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="size-4" />
              {new Date(g.kickoff_at).toLocaleString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
              <span aria-hidden="true">&middot;</span>
              <Countdown
                kickoffAt={g.kickoff_at}
                status={g.status}
                homeScore={g.home_score}
                awayScore={g.away_score}
                className="text-sm"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Trophy className="size-4" />
          <CurrencyAmount usd={volume} className="text-sm" /> Vol.
        </div>
      </div>

      <div className="mt-6">
        <GameWorkspace
          gameTitle={`${g.home_team} vs ${g.away_team}`}
          sections={sections}
          series={series}
          ladders={ladders}
          positions={positions}
          loggedIn={!!user}
          minOrderSize={gameMarkets[0]?.min_order_size ?? 1}
          tape={tape}
          seenTradeIds={seenTradeIds}
          sidebarExtras={sidebarExtras}
        />
      </div>
    </div>
  )
}
