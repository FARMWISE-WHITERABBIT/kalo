"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowUpRight } from "lucide-react"
import { GameChart, type GameSeries } from "@/components/world-cup/game-chart"
import { TradePanel } from "@/components/world-cup/trade-panel"
import { LiveBets } from "@/components/world-cup/live-bets"
import { formatShares, cn } from "@/lib/utils"
import { useNow } from "@/lib/use-now"
import type { Ladder } from "@/lib/orderbook"
import type { Outcome } from "@/lib/types"

export type BoardRow = {
  kind: string
  marketId: string
  label: string
  flag: string
  question: string
  yesPrice: number | null
  status: string
  resolvedOutcome: string | null
}

export type BoardSection = { title: string; rows: BoardRow[] }

export type GameTapeEntry = {
  id: string
  label: string
  outcome: string
  priceCents: number
  amount: number
  createdAt: string
}

function timeAgo(iso: string, now: number) {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${Math.floor(s)}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

// Client shell of the game page: the board rows select into the fixed trade
// ticket on the right (Polymarket-style), the chart and activity feed stay
// live via LiveBets' realtime + poll refresh loop.
export function GameWorkspace({
  gameTitle,
  sections,
  series,
  ladders,
  positions,
  loggedIn,
  minOrderSize,
  tape,
  seenTradeIds,
  sidebarExtras,
}: {
  gameTitle: string
  sections: BoardSection[]
  series: GameSeries[]
  ladders: Record<string, Ladder>
  positions: Record<string, { yes: number; no: number }>
  loggedIn: boolean
  minOrderSize: number
  tape: GameTapeEntry[]
  seenTradeIds: string[]
  sidebarExtras?: React.ReactNode
}) {
  const rows = sections.flatMap((s) => s.rows)
  const firstOpen = rows.find((r) => r.status === "open") ?? rows[0]
  const [selectedId, setSelectedId] = useState(firstOpen?.marketId ?? "")
  const [outcome, setOutcome] = useState<Outcome>("YES")
  const clock = useNow()

  const selected = rows.find((r) => r.marketId === selectedId) ?? firstOpen
  const marketIds = rows.map((r) => r.marketId)
  const labels = Object.fromEntries(rows.map((r) => [r.marketId, r.label]))

  function pick(row: BoardRow, o: Outcome) {
    setSelectedId(row.marketId)
    setOutcome(o)
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <LiveBets marketIds={marketIds} labels={labels} seenIds={seenTradeIds} />

      {/* ------------------------------------------------ left column */}
      <div className="min-w-0">
        <GameChart series={series} />

        {sections.map((sec) => {
          if (sec.rows.length === 0) return null
          return (
            <section key={sec.title} className="mt-7 border-t border-border/60 pt-5">
              <h2 className="text-lg font-bold">{sec.title}</h2>
              <div className="mt-1 divide-y divide-border/40">
                {sec.rows.map((row) => {
                  const active = row.marketId === selected?.marketId
                  const yes = row.yesPrice
                  const resolved = row.status === "resolved"
                  return (
                    <div
                      key={row.marketId}
                      className={cn(
                        "-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors",
                        active && "bg-secondary/40"
                      )}
                    >
                      <button
                        onClick={() => pick(row, "YES")}
                        className="min-w-0 flex-1 text-left text-[15px] font-medium hover:text-primary"
                      >
                        <span className="line-clamp-1">{row.label}</span>
                      </button>
                      <Link
                        href={`/market/${row.marketId}`}
                        className="shrink-0 text-muted-foreground/50 transition-colors hover:text-foreground"
                        aria-label={`Open the full ${row.label} market`}
                      >
                        <ArrowUpRight className="size-4" />
                      </Link>
                      <span className="w-12 shrink-0 text-right text-lg font-bold tabular-nums">
                        {yes !== null ? `${Math.round(yes * 100)}%` : "—"}
                      </span>
                      {resolved ? (
                        <span
                          className={cn(
                            "flex h-9 w-[148px] shrink-0 items-center justify-center rounded-lg text-sm font-semibold",
                            row.resolvedOutcome === "YES"
                              ? "bg-yes/15 text-yes"
                              : "bg-secondary/40 text-muted-foreground"
                          )}
                        >
                          {row.resolvedOutcome === "YES" ? "Yes ✓" : "No ✓"}
                        </span>
                      ) : (
                        <div className="flex shrink-0 gap-1.5">
                          <button
                            onClick={() => pick(row, "YES")}
                            className={cn(
                              "flex h-9 w-[72px] items-center justify-center gap-1 rounded-lg text-sm font-semibold transition-colors",
                              active && outcome === "YES"
                                ? "bg-yes text-white"
                                : "bg-yes/15 text-yes hover:bg-yes hover:text-white"
                            )}
                          >
                            Yes {yes !== null ? `${Math.round(yes * 100)}¢` : ""}
                          </button>
                          <button
                            onClick={() => pick(row, "NO")}
                            className={cn(
                              "flex h-9 w-[72px] items-center justify-center gap-1 rounded-lg text-sm font-semibold transition-colors",
                              active && outcome === "NO"
                                ? "bg-no text-white"
                                : "bg-no/15 text-no hover:bg-no hover:text-white"
                            )}
                          >
                            No {yes !== null ? `${100 - Math.round(yes * 100)}¢` : ""}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}

        {/* live activity: every print with its dollar amount */}
        <section className="mt-7 border-t border-border/60 pt-5">
          <h2 className="text-lg font-bold">Activity</h2>
          <div className="mt-1 divide-y divide-border/40">
            {tape.length === 0 && (
              <p className="py-2.5 text-sm text-muted-foreground">No bets on this game yet.</p>
            )}
            {tape.map((t) => {
              const yes = t.outcome === "YES"
              return (
                <div key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span
                    className={cn("size-2 shrink-0 rounded-full", yes ? "bg-yes" : "bg-no")}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-bold tabular-nums">
                      ${t.amount >= 100 ? Math.round(t.amount) : formatShares(t.amount)}
                    </span>{" "}
                    <span className={yes ? "text-yes" : "text-no"}>{yes ? "Yes" : "No"}</span>{" "}
                    <span className="font-medium">{t.label}</span>{" "}
                    <span className="text-muted-foreground">@ {t.priceCents}&cent;</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {clock ? timeAgo(t.createdAt, clock) : ""}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      {/* ------------------------------------------------ right rail */}
      <aside className="space-y-4 lg:sticky lg:top-32">
        {selected && (
          <TradePanel
            gameTitle={gameTitle}
            flag={selected.flag}
            selection={{
              marketId: selected.marketId,
              label: selected.label,
              question: selected.question,
            }}
            ladder={ladders[selected.marketId] ?? { bids: [], asks: [] }}
            lastYes={selected.yesPrice ?? 0.5}
            isOpen={selected.status === "open"}
            loggedIn={loggedIn}
            minOrderSize={minOrderSize}
            yesShares={positions[selected.marketId]?.yes ?? 0}
            noShares={positions[selected.marketId]?.no ?? 0}
            outcome={outcome}
            onOutcomeChange={setOutcome}
          />
        )}
        {sidebarExtras}
      </aside>
    </div>
  )
}
