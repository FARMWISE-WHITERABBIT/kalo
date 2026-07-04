"use client"

import Link from "next/link"
import { useActionState } from "react"
import { Activity, Bot, Flame, Pause, Play, Zap } from "lucide-react"
import { botCommand } from "@/app/actions/bots"
import type { ActionState } from "@/app/actions/trading"
import { CurrencyAmount } from "@/components/currency-amount"
import { cn } from "@/lib/utils"

export type BotStatus = {
  enabled: boolean
  aggression: number
  burst_markets: number
  bots: number
  resting_orders: number
  trades_1h: number
  trades_24h: number
  volume_24h: number
  trending: { market_id: string; question: string; heat: number; vol24: number }[]
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-secondary/40 px-3 py-2.5">
      <div className="text-lg font-bold leading-tight tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  )
}

const AGGRESSION_LEVELS = [0.5, 1, 2, 3]

export function CommandCentre({ status }: { status: BotStatus }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(botCommand, null)

  return (
    <section className="rounded-xl border border-border/60 bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Bot className="size-5 text-primary" />
          Bot fleet
        </h2>
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
            status.enabled ? "bg-yes/15 text-yes" : "bg-secondary text-muted-foreground"
          )}
        >
          <span
            className={cn("size-1.5 rounded-full", status.enabled ? "bg-yes" : "bg-muted-foreground")}
          />
          {status.enabled ? "Trading live · 15s bursts" : "Paused"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Bots" value={status.bots} />
        <Stat label="Resting orders" value={status.resting_orders} />
        <Stat label="Trades · 1h" value={status.trades_1h} />
        <Stat label="Trades · 24h" value={status.trades_24h} />
        <Stat
          label="Volume · 24h"
          value={<CurrencyAmount usd={status.volume_24h} className="text-lg font-bold" />}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <form action={formAction}>
          <input type="hidden" name="action" value={status.enabled ? "pause" : "resume"} />
          <button
            type="submit"
            disabled={pending}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold transition-colors disabled:opacity-60",
              status.enabled
                ? "bg-secondary text-foreground hover:bg-secondary/70"
                : "bg-yes text-white hover:bg-yes/90"
            )}
          >
            {status.enabled ? <Pause className="size-4" /> : <Play className="size-4" />}
            {status.enabled ? "Pause" : "Resume"}
          </button>
        </form>

        <form action={formAction}>
          <input type="hidden" name="action" value="burst" />
          <input type="hidden" name="value" value="8" />
          <button
            type="submit"
            disabled={pending}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            <Zap className="size-4" />
            Run burst now
          </button>
        </form>

        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Aggression</span>
          {AGGRESSION_LEVELS.map((a) => (
            <form key={a} action={formAction}>
              <input type="hidden" name="action" value="aggression" />
              <input type="hidden" name="value" value={a} />
              <button
                type="submit"
                disabled={pending}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-60",
                  Number(status.aggression) === a
                    ? "bg-primary/20 text-primary"
                    : "bg-secondary/60 text-muted-foreground hover:text-foreground"
                )}
              >
                {a}×
              </button>
            </form>
          ))}
        </div>
      </div>

      {state?.error && <p className="mt-3 text-sm text-destructive">{state.error}</p>}

      {status.trending.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Activity className="size-4 text-muted-foreground" />
            Trending now
          </div>
          <div className="mt-2 divide-y divide-border/40">
            {status.trending.map((t, i) => (
              <Link
                key={t.market_id}
                href={`/market/${t.market_id}`}
                className="group flex items-center gap-3 py-2 text-sm"
              >
                <span className="w-4 text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium group-hover:text-primary">
                  {t.question}
                </span>
                {t.heat > 1.5 && (
                  <span className="flex items-center gap-0.5 text-xs font-semibold text-no">
                    <Flame className="size-3.5" />
                    {t.heat}×
                  </span>
                )}
                <span className="shrink-0 text-xs text-muted-foreground">
                  <CurrencyAmount usd={t.vol24} className="text-xs" /> · 24h
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
