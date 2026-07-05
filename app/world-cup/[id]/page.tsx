import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronRight, Clock, Trophy } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { LiveRefresher } from "@/components/live-refresher"
import { CurrencyAmount } from "@/components/currency-amount"
import { Countdown } from "@/components/world-cup/countdown"
import { GameChart, type GameSeries } from "@/components/world-cup/game-chart"
import { tradeYesPrice } from "@/lib/orderbook"
import {
  buildGameBoards,
  flagFor,
  kindLabel,
  priceCents,
  type BoardMarket,
  type Game,
  type MarketKind,
} from "@/lib/world-cup"
import { cn } from "@/lib/utils"
import type { Market, Trade } from "@/lib/types"

const SERIES_COLORS = ["var(--chart-1)", "var(--chart-4)", "var(--chart-3)"]

function PropRow({ market, label }: { market: BoardMarket | undefined; label: string }) {
  if (!market) return null
  const yes = market.yesPrice
  const resolved = market.status === "resolved"
  return (
    <div className="flex items-center gap-3 py-2.5">
      <Link
        href={`/market/${market.id}`}
        className="min-w-0 flex-1 text-[15px] font-medium hover:text-primary"
      >
        <span className="line-clamp-1">{label}</span>
      </Link>
      <span className="w-12 shrink-0 text-right text-lg font-bold tabular-nums">
        {yes !== null ? `${Math.round(yes * 100)}%` : "—"}
      </span>
      {resolved ? (
        <span
          className={cn(
            "flex h-9 w-[104px] shrink-0 items-center justify-center rounded-lg text-sm font-semibold",
            market.resolvedOutcome === "YES" ? "bg-yes/15 text-yes" : "bg-secondary/40 text-muted-foreground"
          )}
        >
          {market.resolvedOutcome === "YES" ? "Yes ✓" : "No ✓"}
        </span>
      ) : (
        <div className="flex shrink-0 gap-1.5">
          <Link
            href={`/market/${market.id}?buy=YES`}
            className="flex h-9 w-[72px] items-center justify-center gap-1 rounded-lg bg-yes/15 text-sm font-semibold text-yes transition-colors hover:bg-yes hover:text-white"
          >
            Yes {priceCents(yes)}
          </Link>
          <Link
            href={`/market/${market.id}?buy=NO`}
            className="flex h-9 w-[72px] items-center justify-center gap-1 rounded-lg bg-no/15 text-sm font-semibold text-no transition-colors hover:bg-no hover:text-white"
          >
            No {yes !== null ? `${100 - Math.round(yes * 100)}¢` : "—"}
          </Link>
        </div>
      )}
    </div>
  )
}

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: game }, { data: markets }] = await Promise.all([
    supabase.from("games").select("*").eq("id", id).single(),
    supabase.from("markets").select("*").eq("game_id", id),
  ])

  if (!game) notFound()
  const g: Game = game
  const gameMarkets: Market[] = markets ?? []

  let trades: Trade[] = []
  if (gameMarkets.length > 0) {
    const { data } = await supabase
      .from("trades")
      .select("*")
      .in("market_id", gameMarkets.map((m) => m.id))
      .order("created_at", { ascending: false })
      .limit(1500)
    trades = data ?? []
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

  const rules = gameMarkets.find((m) => m.market_kind === "moneyline_home")?.description ?? null
  const stillTrading = g.status !== "finished"

  const sections: { title: string; rows: { kind: MarketKind; label: string }[] }[] = [
    {
      title: "Moneyline",
      rows: [
        { kind: "moneyline_home", label: kindLabel("moneyline_home", g) },
        { kind: "draw", label: kindLabel("draw", g) },
        { kind: "moneyline_away", label: kindLabel("moneyline_away", g) },
      ],
    },
    {
      title: "Spread",
      rows: [{ kind: "spread_home", label: kindLabel("spread_home", g, kinds.spread_home?.line) }],
    },
    {
      title: "Total goals",
      rows: [{ kind: "total_over", label: kindLabel("total_over", g, kinds.total_over?.line) }],
    },
    {
      title: "Props",
      rows: [{ kind: "btts", label: kindLabel("btts", g) }],
    },
  ]

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6">
      {g.status !== "finished" && <LiveRefresher intervalMs={15000} />}

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

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ------------------------------------------------ left column */}
        <div className="min-w-0">
          <GameChart series={series} />

          {sections.map((sec) => {
            const rows = sec.rows.filter((r) => kinds[r.kind])
            if (rows.length === 0) return null
            return (
              <section key={sec.title} className="mt-8 border-t border-border/60 pt-5">
                <h2 className="text-lg font-bold">{sec.title}</h2>
                <div className="mt-1 divide-y divide-border/40">
                  {rows.map((r) => (
                    <PropRow key={r.kind} market={kinds[r.kind]} label={r.label} />
                  ))}
                </div>
              </section>
            )
          })}

          {rules && (
            <section className="mt-8 border-t border-border/60 pt-5">
              <h2 className="text-lg font-bold">Rules</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-foreground/80">
                All markets on this game settle on regulation time (90 minutes plus stoppage)
                per the official FIFA match report on FIFA.com — extra time and penalty
                shootouts do not count. Each option above is an independent Yes/No market;
                open one for its full resolution criteria, order book and activity.
              </p>
              {stillTrading && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Trading stays open through the match and closes two hours after kickoff.
                </p>
              )}
            </section>
          )}
        </div>

        {/* ------------------------------------------------ right rail */}
        <aside className="space-y-4 lg:sticky lg:top-32">
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
              exchange. Pick an outcome to open its trade ticket.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
