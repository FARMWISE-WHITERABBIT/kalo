import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { Countdown } from "@/components/world-cup/countdown"
import { cn } from "@/lib/utils"
import { flagFor, priceCents, type BoardMarket, type GameBoard } from "@/lib/world-cup"

// One outcome button on the board: shows the last YES price, deep-links into
// the underlying binary market's trade ticket.
function OutcomeButton({
  market,
  label,
  className,
}: {
  market: BoardMarket | undefined
  label?: string
  className?: string
}) {
  if (!market) {
    return (
      <span
        className={cn(
          "flex h-9 items-center justify-center rounded-lg bg-secondary/40 text-sm text-muted-foreground/50",
          className
        )}
      >
        —
      </span>
    )
  }
  if (market.status === "resolved") {
    const won = market.resolvedOutcome === "YES"
    return (
      <span
        className={cn(
          "flex h-9 items-center justify-center gap-1 rounded-lg text-sm font-semibold",
          won ? "bg-yes/15 text-yes" : "bg-secondary/40 text-muted-foreground/60",
          className
        )}
      >
        {label && <span className="truncate">{label}</span>}
        {won ? "✓" : "✕"}
      </span>
    )
  }
  return (
    <Link
      href={`/market/${market.id}?buy=YES`}
      className={cn(
        "group flex h-9 items-center justify-center gap-1.5 rounded-lg bg-secondary/70 px-2 text-sm font-semibold transition-colors hover:bg-yes hover:text-white",
        className
      )}
    >
      {label && <span className="min-w-0 truncate text-xs text-muted-foreground group-hover:text-white/80">{label}</span>}
      <span className="tabular-nums">{priceCents(market.yesPrice)}</span>
    </Link>
  )
}

// A fixture row on the World Cup board: kickoff + both teams on the left,
// then MONEYLINE / DRAW / SPREAD / TOTAL button columns, Polymarket-style.
export function GameCard({ board }: { board: GameBoard }) {
  const { game, kinds } = board
  const kickoff = new Date(game.kickoff_at)
  const time = kickoff.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-muted-foreground/40">
      {/* column headers on md+ */}
      <div className="mb-2 hidden grid-cols-[minmax(0,1fr)_repeat(4,108px)_24px] gap-x-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:grid">
        <span className="flex items-end gap-2">
          <Countdown
            kickoffAt={game.kickoff_at}
            status={game.status}
            homeScore={game.home_score}
            awayScore={game.away_score}
            className="text-[11px]"
          />
          <span>{time}</span>
        </span>
        <span className="text-center">Moneyline</span>
        <span className="text-center">Draw</span>
        <span className="text-center">Spread</span>
        <span className="text-center">Total</span>
        <span />
      </div>

      <div className="grid items-center gap-x-3 gap-y-2 md:grid-cols-[minmax(0,1fr)_repeat(4,108px)_24px]">
        <Link href={`/world-cup/${game.id}`} className="group min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="text-xl leading-none">{flagFor(game.home_code)}</span>
            <span className="truncate text-[15px] font-semibold group-hover:text-primary">
              {game.home_team}
            </span>
            {game.status === "finished" && game.home_score !== null && (
              <span className="ml-auto pr-2 text-sm font-bold tabular-nums">{game.home_score}</span>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-2.5">
            <span className="text-xl leading-none">{flagFor(game.away_code)}</span>
            <span className="truncate text-[15px] font-semibold group-hover:text-primary">
              {game.away_team}
            </span>
            {game.status === "finished" && game.away_score !== null && (
              <span className="ml-auto pr-2 text-sm font-bold tabular-nums">{game.away_score}</span>
            )}
          </div>
          <div className="mt-1.5 text-xs text-muted-foreground md:hidden">
            {time} ·{" "}
            <Countdown
              kickoffAt={game.kickoff_at}
              status={game.status}
              homeScore={game.home_score}
              awayScore={game.away_score}
              className="text-xs"
            />
          </div>
        </Link>

        <div className="flex flex-col gap-1.5">
          <OutcomeButton market={kinds.moneyline_home} label={game.home_code} />
          <OutcomeButton market={kinds.moneyline_away} label={game.away_code} />
        </div>
        <OutcomeButton market={kinds.draw} label="Draw" className="md:self-stretch md:!h-auto" />
        <OutcomeButton
          market={kinds.spread_home}
          label={`${game.home_code} −${kinds.spread_home?.line ?? 1.5}`}
          className="md:self-stretch md:!h-auto"
        />
        <OutcomeButton
          market={kinds.total_over}
          label={`O ${kinds.total_over?.line ?? 2.5}`}
          className="md:self-stretch md:!h-auto"
        />

        <Link
          href={`/world-cup/${game.id}`}
          className="hidden justify-self-center text-muted-foreground transition-colors hover:text-foreground md:block"
          aria-label={`${game.home_team} vs ${game.away_team} details`}
        >
          <ChevronRight className="size-5" />
        </Link>
      </div>
    </div>
  )
}
