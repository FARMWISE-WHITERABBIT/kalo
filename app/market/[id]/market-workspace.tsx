"use client"

import Link from "next/link"
import { useActionState, useState } from "react"
import { ArrowDown, ArrowUp, ChevronDown, Clock, Trophy } from "lucide-react"
import { placeOrder, type ActionState } from "@/app/actions/trading"
import { BigChart, type PricePoint } from "@/components/big-chart"
import { MarketThumb } from "@/components/market-card"
import { CurrencyAmount } from "@/components/currency-amount"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatShares, formatTradeKind, cn } from "@/lib/utils"
import { useNow } from "@/lib/use-now"
import type { Ladder } from "@/lib/orderbook"
import type { Outcome, OrderSide } from "@/lib/types"

export type TapeEntry = {
  id: string
  priceYes: number
  size: number
  kind: string | null
  createdAt: string
}

type WorkspaceProps = {
  marketId: string
  question: string
  category: string | null
  description: string | null
  closeAt: string | null
  isOpen: boolean
  resolvedOutcome: Outcome | null
  points: PricePoint[]
  ladder: Ladder
  tape: TapeEntry[]
  volume: number
  yesShares: number
  noShares: number
  loggedIn: boolean
  initialOutcome?: Outcome
  sidebarExtras?: React.ReactNode
}

function timeAgo(iso: string, now: number) {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${Math.floor(s)}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

const clampPrice = (p: number) => Math.min(0.99, Math.max(0.01, p))

export function MarketWorkspace({
  marketId,
  question,
  category,
  description,
  closeAt,
  isOpen,
  resolvedOutcome,
  points,
  ladder,
  tape,
  volume,
  yesShares,
  noShares,
  loggedIn,
  initialOutcome = "YES",
  sidebarExtras,
}: WorkspaceProps) {
  const [outcome, setOutcome] = useState<Outcome>(initialOutcome)
  const [side, setSide] = useState<OrderSide>("BUY")
  const [mode, setMode] = useState<"LIMIT" | "MARKET">("MARKET")
  const [price, setPrice] = useState("50")
  const [size, setSize] = useState("10")
  const [marketError, setMarketError] = useState<string | null>(null)
  const [state, formAction, pending] = useActionState<ActionState, FormData>(placeOrder, null)

  // During SSR the last trade's timestamp stands in for the wall clock, which
  // renders deterministically; the real clock takes over after hydration.
  const clock = useNow()
  const now = clock ?? (points.length ? points[points.length - 1].t : 0)

  const lastYes = points.length ? points[points.length - 1].p : 0.5
  const yesPct = Math.round(lastYes * 100)
  const dayAgo = now - 24 * 60 * 60 * 1000
  const prior = points.filter((pt) => pt.t < dayAgo)
  const dayDelta = prior.length ? yesPct - Math.round(prior[prior.length - 1].p * 100) : null

  const bestAskYes = ladder.asks[0]?.price
  const bestBidYes = ladder.bids[0]?.price
  const yesBuyPrice = bestAskYes ?? lastYes
  const noBuyPrice = clampPrice(1 - (bestBidYes ?? lastYes))

  function onPick(o: Outcome, s: OrderSide, p: number) {
    setOutcome(o)
    setSide(s)
    setMode("LIMIT")
    setPrice(String(Math.round(p * 100)))
  }

  const priceCents = Math.min(99, Math.max(1, Number(price) || 0))
  const priceNum = priceCents / 100
  const sizeNum = Number(size) || 0
  const ownedShares = outcome === "YES" ? yesShares : noShares

  function marketablePrice(): number | null {
    if (side === "BUY") {
      if (ladder.asks.length === 0) return null
      const bestYes = ladder.asks[0].price
      return outcome === "YES" ? bestYes : clampPrice(1 - bestYes)
    } else {
      if (ladder.bids.length === 0) return null
      const bestYes = ladder.bids[0].price
      return outcome === "YES" ? bestYes : clampPrice(1 - bestYes)
    }
  }

  function handleSubmit(formData: FormData) {
    setMarketError(null)
    if (mode === "MARKET") {
      const p = marketablePrice()
      if (p === null) {
        setMarketError("No liquidity on the other side right now.")
        return
      }
      formData.set("price", String(p))
      formData.set("ioc", "true")
    } else {
      formData.set("price", String(priceNum))
      formData.set("ioc", "false")
    }
    formAction(formData)
  }

  // Cumulative $ totals for order book rows, Polymarket-style.
  const askRows = [...ladder.asks].slice(0, 6)
  const bidRows = ladder.bids.slice(0, 6)
  const askTotals = askRows.map((_, i) =>
    askRows.slice(0, i + 1).reduce((sum, l) => sum + l.price * l.size, 0)
  )
  const bidTotals = bidRows.map((_, i) =>
    bidRows.slice(0, i + 1).reduce((sum, l) => sum + (1 - l.price) * l.size, 0)
  )
  const spread =
    bestAskYes !== undefined && bestBidYes !== undefined
      ? Math.round((bestAskYes - bestBidYes) * 100)
      : null

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* ------------------------------------------------ left column */}
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tracking-tight">{yesPct}% chance</span>
          {dayDelta !== null && dayDelta !== 0 && (
            <span
              className={cn(
                "flex items-center gap-0.5 text-sm font-semibold",
                dayDelta > 0 ? "text-yes" : "text-no"
              )}
            >
              {dayDelta > 0 ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
              {Math.abs(dayDelta)}%
            </span>
          )}
        </div>

        <div className="mt-3">
          <BigChart
            points={points}
            meta={
              <>
                <span className="flex items-center gap-1.5">
                  <Trophy className="size-4" />
                  <CurrencyAmount usd={volume} className="text-sm" /> Vol.
                </span>
                {closeAt && (
                  <span className="flex items-center gap-1.5 border-l border-border pl-3">
                    <Clock className="size-4" />
                    {new Date(closeAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                )}
              </>
            }
          />
        </div>

        {/* ------------------------------------------ order book */}
        <details open className="mt-8 border-t border-border/60 pt-5">
          <summary className="flex cursor-pointer list-none items-center justify-between">
            <h2 className="text-lg font-bold">Order Book</h2>
            <ChevronDown className="size-4 text-muted-foreground" />
          </summary>

          <div className="mt-3 overflow-hidden rounded-xl border border-border/60">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 border-b border-border/60 bg-secondary/30 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span>Trade Yes</span>
              <span className="w-16 text-right">Price</span>
              <span className="w-20 text-right">Shares</span>
              <span className="w-20 text-right">Total</span>
            </div>

            {askRows.length === 0 && bidRows.length === 0 && (
              <p className="px-4 py-3 text-sm text-muted-foreground">No open orders yet.</p>
            )}

            {[...askRows].reverse().map((l, i) => (
              <button
                key={"a" + l.price}
                onClick={() => isOpen && onPick("YES", "BUY", l.price)}
                className="relative grid w-full grid-cols-[1fr_auto_auto_auto] items-center gap-x-6 px-4 py-1.5 text-sm hover:bg-no/10"
              >
                <span
                  className="absolute inset-y-0 left-0 bg-no/10"
                  style={{ width: `${Math.min(100, (l.size / Math.max(...askRows.map((a) => a.size))) * 40)}%` }}
                  aria-hidden="true"
                />
                <span className="relative text-left text-xs text-muted-foreground">
                  {i === askRows.length - 1 ? "Asks" : ""}
                </span>
                <span className="relative w-16 text-right font-semibold text-no">
                  {Math.round(l.price * 100)}&cent;
                </span>
                <span className="relative w-20 text-right tabular-nums text-foreground/90">
                  {formatShares(l.size)}
                </span>
                <span className="relative w-20 text-right tabular-nums text-muted-foreground">
                  <CurrencyAmount usd={askTotals[askRows.length - 1 - i]} className="text-sm" />
                </span>
              </button>
            ))}

            <div className="flex items-center justify-between border-y border-border/60 bg-secondary/20 px-4 py-1.5 text-xs font-medium text-muted-foreground">
              <span>Spread</span>
              <span>{spread !== null ? `${spread}¢` : "—"}</span>
            </div>

            {bidRows.map((l, i) => {
              const sellingYes = yesShares > 0
              return (
                <button
                  key={"b" + l.price}
                  onClick={() =>
                    isOpen &&
                    (sellingYes
                      ? onPick("YES", "SELL", l.price)
                      : onPick("NO", "BUY", clampPrice(1 - l.price)))
                  }
                  className="relative grid w-full grid-cols-[1fr_auto_auto_auto] items-center gap-x-6 px-4 py-1.5 text-sm hover:bg-yes/10"
                >
                  <span
                    className="absolute inset-y-0 left-0 bg-yes/10"
                    style={{ width: `${Math.min(100, (l.size / Math.max(...bidRows.map((b) => b.size))) * 40)}%` }}
                    aria-hidden="true"
                  />
                  <span className="relative text-left text-xs text-muted-foreground">
                    {i === 0 ? "Bids" : ""}
                  </span>
                  <span className="relative w-16 text-right font-semibold text-yes">
                    {Math.round(l.price * 100)}&cent;
                  </span>
                  <span className="relative w-20 text-right tabular-nums text-foreground/90">
                    {formatShares(l.size)}
                  </span>
                  <span className="relative w-20 text-right tabular-nums text-muted-foreground">
                    <CurrencyAmount usd={bidTotals[i]} className="text-sm" />
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            One canonical YES-terms book — NO orders are shown at their YES-equivalent price. Tap a
            level to load it into the ticket.
          </p>
        </details>

        {/* ------------------------------------------ rules */}
        <section className="mt-8 border-t border-border/60 pt-5">
          <h2 className="text-lg font-bold">Rules</h2>
          <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-foreground/80">
            <p>
              This market will resolve to &ldquo;Yes&rdquo; if the event described below occurs, and
              &ldquo;No&rdquo; otherwise. Winning shares redeem for $1 of play money each.
            </p>
            {description && <p>{description}</p>}
            {closeAt && (
              <p className="text-muted-foreground">
                Trading closes {new Date(closeAt).toLocaleString()}.
              </p>
            )}
          </div>

          <details className="group mt-4">
            <summary className="cursor-pointer text-sm font-medium text-primary">
              Show more — how settlement works
            </summary>
            <div className="mt-3 space-y-3 rounded-xl border border-border/60 bg-card p-4 text-sm leading-relaxed text-muted-foreground">
              <p>
                Kalo keeps one canonical order book per market, in YES terms — a bid to buy NO at{" "}
                <CurrencyAmount usd={0.4} className="text-foreground" /> is the same thing as an ask
                on YES at the complement price, so both sides share one book and one spread.
              </p>
              <p>
                The matching engine runs price-time priority and settles each cross one of three
                ways: <em>transfer</em> (a buyer and seller of the same outcome swap existing
                contracts), <em>mint</em> (a YES buyer and a NO buyer whose prices sum to at least $1
                jointly fund a new contract pair), and <em>merge</em> (a YES seller and a NO seller
                surrender a pair, burned for the $1 collateral split between them). The activity feed
                labels each print with its settlement type.
              </p>
              <p className="mb-0">
                Every contract pair is fully collateralized at creation — the house never carries
                outcome risk. Losers fund winners.
              </p>
            </div>
          </details>
        </section>

        {/* ------------------------------------------ activity */}
        <section className="mt-8 border-t border-border/60 pt-5">
          <h2 className="text-lg font-bold">Activity</h2>
          <div className="mt-3">
            {tape.length === 0 && <p className="text-sm text-muted-foreground">No trades yet.</p>}
            <div className="divide-y divide-border/40">
              {tape.map((t) => {
                const pct = Math.round(t.priceYes * 100)
                return (
                  <div key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        pct >= 50 ? "bg-yes" : "bg-no"
                      )}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{formatShares(t.size)}</span>{" "}
                      <span className={pct >= 50 ? "text-yes" : "text-no"}>Yes</span> at{" "}
                      <span className="font-medium">{pct}&cent;</span>{" "}
                      <span className="text-muted-foreground">({formatTradeKind(t.kind)})</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {clock ? timeAgo(t.createdAt, clock) : ""}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      </div>

      {/* ------------------------------------------------ right rail */}
      <aside className="space-y-4 lg:sticky lg:top-32">
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-lg shadow-black/20">
          <div className="flex items-center gap-2.5">
            <MarketThumb category={category} size={36} />
            <div className="min-w-0 text-sm font-semibold leading-tight">
              <span className="line-clamp-2">{question}</span>
            </div>
          </div>

          {isOpen ? (
            <>
              <div className="mt-4 flex items-center justify-between border-b border-border/60">
                <div className="flex gap-5">
                  {(["BUY", "SELL"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSide(s)}
                      className={cn(
                        "-mb-px border-b-2 pb-2 text-[15px] font-semibold capitalize transition-colors",
                        side === s
                          ? "border-primary text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {s.toLowerCase() === "buy" ? "Buy" : "Sell"}
                    </button>
                  ))}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center gap-1 pb-2 text-sm font-medium text-muted-foreground hover:text-foreground">
                    {mode === "MARKET" ? "Market" : "Limit"}
                    <ChevronDown className="size-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setMode("MARKET")}>Market</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setMode("LIMIT")}>Limit</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setOutcome("YES")}
                  className={cn(
                    "flex h-12 items-center justify-center rounded-lg text-[15px] font-semibold transition-colors",
                    outcome === "YES"
                      ? "bg-yes text-white"
                      : "bg-secondary text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                  )}
                >
                  Yes {Math.round(yesBuyPrice * 100)}&cent;
                </button>
                <button
                  onClick={() => setOutcome("NO")}
                  className={cn(
                    "flex h-12 items-center justify-center rounded-lg text-[15px] font-semibold transition-colors",
                    outcome === "NO"
                      ? "bg-no text-white"
                      : "bg-secondary text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                  )}
                >
                  No {Math.round(noBuyPrice * 100)}&cent;
                </button>
              </div>

              <form action={handleSubmit} className="mt-4">
                <input type="hidden" name="marketId" value={marketId} />
                <input type="hidden" name="outcome" value={outcome} />
                <input type="hidden" name="side" value={side} />

                {mode === "LIMIT" && (
                  <div className="mb-3 flex items-center justify-between">
                    <label htmlFor="price-input" className="text-[15px] font-semibold">
                      Limit Price
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        id="price-input"
                        type="number"
                        min={1}
                        max={99}
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        className="h-9 w-20 rounded-lg border border-input bg-transparent px-2 text-right text-sm font-semibold focus:border-primary focus:outline-none"
                      />
                      <span className="text-sm text-muted-foreground">&cent;</span>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-4">
                  <label htmlFor="size" className="text-[15px] font-semibold">
                    Shares
                  </label>
                  <input
                    id="size"
                    name="size"
                    type="number"
                    min={0}
                    step="0.01"
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                    placeholder="0"
                    className="h-12 min-w-0 flex-1 bg-transparent text-right text-3xl font-bold tabular-nums text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                  />
                </div>

                <div className="mt-1 flex justify-end gap-1.5">
                  {side === "BUY" ? (
                    [1, 10, 50, 100].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setSize(String((Number(size) || 0) + n))}
                        className="rounded-md bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground/80 transition-colors hover:bg-secondary/70"
                      >
                        +{n}
                      </button>
                    ))
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSize(String(ownedShares))}
                      className="rounded-md bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground/80 transition-colors hover:bg-secondary/70"
                    >
                      Max {formatShares(ownedShares)}
                    </button>
                  )}
                </div>

                <div className="mt-3 min-h-4 text-xs text-muted-foreground">
                  {mode === "MARKET" ? (
                    <>Fills at the best available price; the remainder is cancelled.</>
                  ) : side === "BUY" ? (
                    <>
                      Escrow <CurrencyAmount usd={priceNum * sizeNum} className="text-foreground" />{" "}
                      &middot; pays <CurrencyAmount usd={sizeNum} className="text-foreground" /> if{" "}
                      {outcome === "YES" ? "Yes" : "No"} wins
                    </>
                  ) : (
                    <>You hold {formatShares(ownedShares)} {outcome === "YES" ? "Yes" : "No"} shares.</>
                  )}
                </div>

                {marketError && <p className="mt-2 text-sm text-destructive">{marketError}</p>}
                {state?.error && <p className="mt-2 text-sm text-destructive">{state.error}</p>}
                {state?.success && <p className="mt-2 text-sm text-yes">Order placed.</p>}

                {loggedIn ? (
                  <button
                    type="submit"
                    disabled={pending}
                    className="mt-3 flex h-12 w-full items-center justify-center rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                  >
                    {pending ? "Placing…" : "Trade"}
                  </button>
                ) : (
                  <Link
                    href="/login"
                    className="mt-3 flex h-12 w-full items-center justify-center rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Log In to Trade
                  </Link>
                )}
              </form>
            </>
          ) : (
            <div className="mt-4 space-y-3">
              {resolvedOutcome ? (
                <div
                  className={cn(
                    "rounded-lg px-3 py-2.5 text-sm font-semibold",
                    resolvedOutcome === "YES" ? "bg-yes/15 text-yes" : "bg-no/15 text-no"
                  )}
                >
                  Resolved {resolvedOutcome === "YES" ? "Yes" : "No"}
                </div>
              ) : (
                <div className="rounded-lg bg-secondary px-3 py-2.5 text-sm font-semibold text-muted-foreground">
                  Trading closed
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                Trading is closed. Winning shares redeem for $1 each once the market resolves.
              </p>
            </div>
          )}

          <p className="mt-3 text-center text-xs text-muted-foreground">
            By trading, you agree to the <span className="underline">Terms of Use</span>.
          </p>
        </div>

        {(yesShares > 0 || noShares > 0) && (
          <div className="rounded-xl border border-border/60 bg-card p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Your position
            </div>
            <div className="mt-2 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="font-medium text-yes">Yes shares</span>
                <span className="tabular-nums">{formatShares(yesShares)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-no">No shares</span>
                <span className="tabular-nums">{formatShares(noShares)}</span>
              </div>
            </div>
          </div>
        )}

        {sidebarExtras}
      </aside>
    </div>
  )
}
