"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

export type LiveBet = {
  id: string
  amount: number
  outcome: string
  priceCents: number
  label: string
}

// The "the floor is live" layer: watches the game's markets for new prints
// and pops a small toast per bet ("$342 Yes · England @ 40¢"), stacking the
// most recent few bottom-left. Realtime INSERTs give the instant path; a
// short poll is the fallback (and doubles as the data refresher, so the
// chart, prices and activity feed move without a manual reload).
export function LiveBets({
  marketIds,
  labels,
  seenIds,
}: {
  marketIds: string[]
  /** market id → outcome label ("Mexico", "Draw", "Over 2.5", …) */
  labels: Record<string, string>
  /** trade ids already rendered server-side — never toast these */
  seenIds: string[]
}) {
  const router = useRouter()
  const [toasts, setToasts] = useState<LiveBet[]>([])
  const seen = useRef<Set<string>>(new Set(seenIds))
  const lastRefresh = useRef(0)

  useEffect(() => {
    if (marketIds.length === 0) return
    const supabase = createClient()

    function refresh() {
      const now = Date.now()
      if (now - lastRefresh.current < 2500) return
      lastRefresh.current = now
      router.refresh()
    }

    function push(trade: {
      id: string
      market_id: string
      outcome: string
      price: number
      size: number
    }) {
      if (seen.current.has(trade.id)) return
      seen.current.add(trade.id)
      const bet: LiveBet = {
        id: trade.id,
        amount: trade.price * trade.size,
        outcome: trade.outcome,
        priceCents: Math.round(trade.price * 100),
        label: labels[trade.market_id] ?? "",
      }
      setToasts((prev) => [bet, ...prev].slice(0, 4))
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== bet.id))
      }, 5000)
      refresh()
    }

    const channel = supabase
      .channel(`game-bets-${marketIds[0]}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "trades",
          filter: `market_id=in.(${marketIds.join(",")})`,
        },
        (payload) => push(payload.new as Parameters<typeof push>[0])
      )
      .subscribe()

    // fallback: realtime can be unavailable; poll the latest prints
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible") return
      const { data } = await supabase
        .from("trades")
        .select("id, market_id, outcome, price, size, created_at")
        .in("market_id", marketIds)
        .order("created_at", { ascending: false })
        .limit(10)
      // oldest first so the newest print ends up on top of the stack
      for (const t of [...(data ?? [])].reverse()) push(t)
    }, 4000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(timer)
    }
    // marketIds/labels are stable for a given game page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketIds.join(","), router])

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-50 flex flex-col-reverse gap-2">
      {toasts.map((t) => {
        const yes = t.outcome === "YES"
        return (
          <div
            key={t.id}
            className="animate-kalo-pop flex items-center gap-2 rounded-lg border border-border/60 bg-popover/95 px-3 py-2 text-sm shadow-lg backdrop-blur"
          >
            <span
              className={cn("size-2 shrink-0 rounded-full", yes ? "bg-yes" : "bg-no")}
              aria-hidden="true"
            />
            <span className="font-bold tabular-nums">
              ${t.amount >= 100 ? Math.round(t.amount) : t.amount.toFixed(2)}
            </span>
            <span className={cn("font-semibold", yes ? "text-yes" : "text-no")}>
              {yes ? "Yes" : "No"}
            </span>
            {t.label && <span className="max-w-40 truncate font-medium">{t.label}</span>}
            <span className="text-muted-foreground">@ {t.priceCents}&cent;</span>
          </div>
        )
      })}
    </div>
  )
}
