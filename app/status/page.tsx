import { Activity, CheckCircle2, CircleAlert } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { CurrencyAmount } from "@/components/currency-amount"
import { cn } from "@/lib/utils"

export const metadata = { title: "Status — Kalo" }

type Status = {
  markets_open: number
  markets_total: number
  trades_24h: number
  volume_24h: number
  trades_15m: number
  traders: number
  invariants: { ok: boolean; checked_at: string } | null
  checked_at: string
}

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/40 py-3 last:border-b-0">
      {ok ? (
        <CheckCircle2 className="size-5 shrink-0 text-yes" />
      ) : (
        <CircleAlert className="size-5 shrink-0 text-no" />
      )}
      <span className="flex-1 text-sm font-medium">{label}</span>
      <span className={cn("text-sm", ok ? "text-muted-foreground" : "text-no")}>{detail}</span>
    </div>
  )
}

export default async function StatusPage() {
  const supabase = await createClient()
  const { data } = await supabase.rpc("system_status")
  const s = data as Status | null

  const invariantsOk = s?.invariants?.ok ?? false
  const engineActive = (s?.trades_15m ?? 0) > 0
  const allOk = !!s && invariantsOk

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center gap-2.5">
        <Activity className="size-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">System status</h1>
      </div>

      <div
        className={cn(
          "mt-5 rounded-xl p-4 text-sm font-semibold",
          allOk ? "bg-yes/15 text-yes" : "bg-no/15 text-no"
        )}
      >
        {allOk ? "All systems operational" : "Degraded — check the rows below"}
      </div>

      {s ? (
        <>
          <div className="mt-5 rounded-xl border border-border/60 bg-card px-4">
            <StatusRow
              label="Matching engine"
              ok={engineActive}
              detail={engineActive ? `${s.trades_15m} fills in the last 15 min` : "no recent fills"}
            />
            <StatusRow
              label="Conservation invariants (I1–I6)"
              ok={invariantsOk}
              detail={
                s.invariants
                  ? `verified ${new Date(s.invariants.checked_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
                  : "never verified"
              }
            />
            <StatusRow
              label="Market lifecycle"
              ok={s.markets_open > 0}
              detail={`${s.markets_open} of ${s.markets_total} markets open`}
            />
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-border/60 bg-card p-3">
              <div className="text-lg font-bold tabular-nums">{s.trades_24h}</div>
              <div className="text-[11px] text-muted-foreground">Trades · 24h</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-card p-3">
              <div className="text-lg font-bold tabular-nums">
                <CurrencyAmount usd={s.volume_24h} className="text-lg font-bold" />
              </div>
              <div className="text-[11px] text-muted-foreground">Volume · 24h</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-card p-3">
              <div className="text-lg font-bold tabular-nums">{s.traders}</div>
              <div className="text-[11px] text-muted-foreground">Accounts</div>
            </div>
          </div>

          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            The invariant monitor re-verifies the exchange&rsquo;s conservation laws — cash
            conservation, pair symmetry, non-negativity, and trade-table integrity — against the
            live database every 10 minutes. A red row here means trading halts until it is
            investigated.
          </p>
        </>
      ) : (
        <p className="mt-5 text-sm text-muted-foreground">Status is unavailable right now.</p>
      )}
    </div>
  )
}
