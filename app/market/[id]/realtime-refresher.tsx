"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export function RealtimeRefresher({ marketId }: { marketId: string }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`market-${marketId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trades", filter: `market_id=eq.${marketId}` },
        () => router.refresh()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [marketId, router])

  return null
}
