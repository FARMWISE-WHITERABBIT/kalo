"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

// Keeps a server-rendered page live: refreshes on realtime trade inserts
// (instant when a fill prints) and polls as a fallback — order-book-only
// changes (bots re-quoting without a fill) emit no trade event, and realtime
// may be unavailable entirely. Refreshes are debounced so an HFT burst of
// inserts triggers one re-render, and polling pauses while the tab is hidden.
export function LiveRefresher({
  marketId,
  intervalMs = 12000,
}: {
  marketId?: string
  intervalMs?: number
}) {
  const router = useRouter()
  const lastRefresh = useRef(0)

  useEffect(() => {
    function refresh() {
      const now = Date.now()
      if (now - lastRefresh.current < 2500) return
      lastRefresh.current = now
      router.refresh()
    }

    const supabase = createClient()
    const channel = supabase
      .channel(marketId ? `market-${marketId}` : "all-trades")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "trades",
          ...(marketId ? { filter: `market_id=eq.${marketId}` } : {}),
        },
        refresh
      )
      .subscribe()

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh()
    }, intervalMs)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(timer)
    }
  }, [marketId, intervalMs, router])

  return null
}
