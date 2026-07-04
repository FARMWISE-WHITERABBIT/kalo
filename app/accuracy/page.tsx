import { Target } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { tradeYesPrice } from "@/lib/orderbook"
import { cn } from "@/lib/utils"

export const metadata = { title: "Accuracy — Kalo" }

export default async function AccuracyPage() {
  const supabase = await createClient()
  const { data: resolved } = await supabase
    .from("markets")
    .select("*")
    .eq("status", "resolved")
    .order("created_at", { ascending: false })
    .limit(50)

  const markets = resolved ?? []
  let rows: { question: string; finalPct: number; outcome: string; brier: number }[] = []

  if (markets.length > 0) {
    const { data: trades } = await supabase
      .from("trades")
      .select("market_id, outcome, price, created_at, is_seed")
      .in("market_id", markets.map((m) => m.id))
      .order("created_at", { ascending: false })
      .limit(500)

    rows = markets.flatMap((m) => {
      const last = (trades ?? []).find((t) => t.market_id === m.id && !t.is_seed)
        ?? (trades ?? []).find((t) => t.market_id === m.id)
      if (!last || !m.resolved_outcome) return []
      const p = tradeYesPrice(last)
      const y = m.resolved_outcome === "YES" ? 1 : 0
      return [{
        question: m.question,
        finalPct: Math.round(p * 100),
        outcome: m.resolved_outcome,
        brier: (p - y) * (p - y),
      }]
    })
  }

  const meanBrier = rows.length
    ? rows.reduce((s, r) => s + r.brier, 0) / rows.length
    : null

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center gap-2.5">
        <Target className="size-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Market accuracy</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        How well final market prices predicted real outcomes. A market that closed at 80%
        &ldquo;Yes&rdquo; should resolve Yes about 8 times in 10 — the closer prices track
        reality, the lower the Brier score (0 is perfect, 0.25 is a coin flip).
      </p>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-xl border border-border/60 bg-card p-6 text-sm text-muted-foreground">
          No resolved markets yet — accuracy statistics appear after the first resolutions.
        </div>
      ) : (
        <>
          <div className="mt-6 rounded-xl border border-border/60 bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Mean Brier score · {rows.length} resolved market{rows.length === 1 ? "" : "s"}
            </div>
            <div className="text-3xl font-bold tabular-nums">{meanBrier?.toFixed(3)}</div>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-border/60 bg-card">
            <div className="grid grid-cols-[1fr_5rem_5rem_5rem] gap-2 border-b border-border/60 bg-secondary/30 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span>Market</span>
              <span className="text-right">Final</span>
              <span className="text-right">Result</span>
              <span className="text-right">Brier</span>
            </div>
            {rows.map((r, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_5rem_5rem_5rem] items-center gap-2 border-b border-border/40 px-4 py-2.5 text-sm last:border-b-0"
              >
                <span className="truncate font-medium">{r.question}</span>
                <span className="text-right tabular-nums text-muted-foreground">{r.finalPct}%</span>
                <span
                  className={cn(
                    "text-right font-semibold",
                    r.outcome === "YES" ? "text-yes" : "text-no"
                  )}
                >
                  {r.outcome === "YES" ? "Yes" : "No"}
                </span>
                <span className="text-right tabular-nums text-muted-foreground">
                  {r.brier.toFixed(3)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
