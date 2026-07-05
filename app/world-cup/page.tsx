import Link from "next/link"
import { Trophy } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { LiveRefresher } from "@/components/live-refresher"
import { GameCard } from "@/components/world-cup/game-card"
import { buildGameBoards, type Game } from "@/lib/world-cup"
import { cn } from "@/lib/utils"
import type { Market, Trade } from "@/lib/types"

export const metadata = {
  title: "World Cup — Kalo",
  description:
    "Trade FIFA World Cup 2026 match markets with play money: moneylines, spreads, totals and props on every fixture.",
}

export default async function WorldCupPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const { view } = await searchParams
  const showFinished = view === "finished"
  const supabase = await createClient()

  const [{ data: games }, { data: markets }] = await Promise.all([
    supabase.from("games").select("*").order("kickoff_at", { ascending: true }),
    supabase.from("markets").select("*").not("game_id", "is", null),
  ])

  const allGames: Game[] = games ?? []
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

  const boards = buildGameBoards(allGames, gameMarkets, trades)
  const upcoming = boards.filter((b) => b.game.status !== "finished")
  const finished = boards.filter((b) => b.game.status === "finished")
  const shown = showFinished ? finished : upcoming

  // group fixtures by calendar day, board order already kickoff-ascending
  const byDay = new Map<string, typeof shown>()
  for (const b of shown) {
    const day = new Date(b.game.kickoff_at).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    })
    byDay.set(day, [...(byDay.get(day) ?? []), b])
  }

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-6">
      <LiveRefresher intervalMs={20000} />

      {/* hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-r from-[#0b4f2e] via-[#0e6a3c] to-[#0b4f2e] p-6 text-white sm:p-8">
        <div
          className="pointer-events-none absolute -right-8 -top-10 text-[150px] opacity-15"
          aria-hidden="true"
        >
          🏆
        </div>
        <div className="text-xs font-semibold uppercase tracking-widest text-white/70">
          FIFA World Cup 2026
        </div>
        <h1 className="mt-1 text-4xl font-black tracking-tight sm:text-5xl">World Cup</h1>
        <p className="mt-2 max-w-xl text-sm text-white/80">
          Moneylines, spreads, totals and props on every fixture — every option is its own
          fully-collateralized play-money market.
        </p>
      </div>

      {/* tabs */}
      <div className="mt-5 flex items-center justify-between border-b border-border/60">
        <nav className="flex gap-6 text-sm font-semibold">
          {["Games", "Props", "Bracket", "Map"].map((t, i) => (
            <span
              key={t}
              className={cn(
                "-mb-px border-b-2 pb-2.5",
                i === 0
                  ? "border-foreground text-foreground"
                  : "cursor-default border-transparent text-muted-foreground/50"
              )}
              title={i === 0 ? undefined : "Coming soon"}
            >
              {t}
            </span>
          ))}
        </nav>
        <Link
          href={showFinished ? "/world-cup" : "/world-cup?view=finished"}
          className="pb-2.5 text-sm font-medium text-primary hover:text-primary/80"
        >
          {showFinished ? "View Upcoming" : "View Finished"}
        </Link>
      </div>

      {/* date-grouped fixtures */}
      {shown.length === 0 && (
        <p className="mt-8 text-muted-foreground">
          {showFinished ? "No finished games yet." : "No upcoming games on the board."}
        </p>
      )}
      {[...byDay.entries()].map(([day, dayBoards]) => (
        <section key={day} className="mt-7">
          <h2 className="text-lg font-bold">{day}</h2>
          <div className="mt-3 space-y-3">
            {dayBoards.map((b) => (
              <GameCard key={b.game.id} board={b} />
            ))}
          </div>
        </section>
      ))}

      {/* about / faq */}
      <section className="mt-14 rounded-xl border border-border/60 bg-card p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Trophy className="size-5 text-primary" />
          About World Cup markets on Kalo
        </h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <div>
            <div className="text-sm font-semibold">How do match markets work?</div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Every betting option — a team&rsquo;s moneyline, the draw, the spread, the total —
              is an independent Yes/No market. Buy Yes on the outcome you believe in; winning
              shares redeem for $1 of play money when the final whistle settles the game.
            </p>
          </div>
          <div>
            <div className="text-sm font-semibold">Why don&rsquo;t the three moneyline prices sum to 100¢?</div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Home, draw and away trade in separate order books, so their prices drift
              independently with the flow — spotting the gap and trading it back into line is
              part of the game.
            </p>
          </div>
          <div>
            <div className="text-sm font-semibold">When do markets close and resolve?</div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Trading runs through the match and closes two hours after kickoff. All markets
              settle on regulation time (90 minutes plus stoppage) per the official FIFA match
              report — extra time and penalties don&rsquo;t count.
            </p>
          </div>
          <div>
            <div className="text-sm font-semibold">Is this real money?</div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              No. Kalo is a play-money exchange: balances have no cash value, can&rsquo;t be
              bought, sold or transferred, and exist purely for the competition.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
