import { Trophy } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { CurrencyAmount } from "@/components/currency-amount"
import { categoryColor } from "@/lib/avatar"
import { cn } from "@/lib/utils"

export const metadata = { title: "Leaderboard — Kalo" }

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const { data: rows } = await supabase.rpc("leaderboard", { p_limit: 50 })
  const board = rows ?? []

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center gap-2.5">
        <Trophy className="size-6 text-chart-2" />
        <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Ranked by all-time profit &amp; loss — realized plus mark-to-market, not balance.
        Play money only; nothing here has cash value.
      </p>

      <div className="mt-6 overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="grid grid-cols-[3rem_1fr_7rem_7rem] gap-2 border-b border-border/60 bg-secondary/30 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span>Rank</span>
          <span>Trader</span>
          <span className="text-right">Volume</span>
          <span className="text-right">PnL</span>
        </div>

        {board.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground">No traders yet.</p>
        )}

        {board.map((row, i) => (
          <div
            key={row.display_name + i}
            className="grid grid-cols-[3rem_1fr_7rem_7rem] items-center gap-2 border-b border-border/40 px-4 py-2.5 last:border-b-0"
          >
            <span className="text-sm font-semibold text-muted-foreground">
              {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
            </span>
            <span className="flex min-w-0 items-center gap-2.5">
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: categoryColor(row.display_name) }}
                aria-hidden="true"
              >
                {row.display_name.charAt(0).toUpperCase()}
              </span>
              <span className="truncate text-sm font-medium">{row.display_name}</span>
              {row.is_bot && (
                <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Bot
                </span>
              )}
            </span>
            <span className="text-right text-sm tabular-nums text-muted-foreground">
              <CurrencyAmount usd={row.volume} className="text-sm" />
            </span>
            <span
              className={cn(
                "text-right text-sm font-semibold tabular-nums",
                row.pnl > 0 ? "text-yes" : row.pnl < 0 ? "text-no" : "text-muted-foreground"
              )}
            >
              {row.pnl > 0 ? "+" : ""}
              <CurrencyAmount usd={row.pnl} className="text-sm font-semibold" />
            </span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        PnL = current equity (cash + positions and open orders marked to the last traded price)
        minus everything ever granted to the account. Weekly rankings arrive with price-history
        snapshots.
      </p>
    </div>
  )
}
