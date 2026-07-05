"use client"

import Link from "next/link"
import { useActionState, useEffect, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import { placeOrder, type ActionState } from "@/app/actions/trading"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatShares, cn } from "@/lib/utils"
import type { Ladder } from "@/lib/orderbook"
import type { Outcome, OrderSide } from "@/lib/types"

export type PanelSelection = {
  marketId: string
  label: string
  question: string
}

const clampPrice = (p: number) => Math.min(0.99, Math.max(0.01, p))

// The fixed game-page trade ticket, Polymarket-style: bound to whichever
// outcome is selected on the board, Buy in dollars at the market (the
// default), or switch to a resting limit in price + shares. Orders go
// through the same placeOrder action (and the same engine) as the market
// page — the ticket only converts a $ amount into shares at the touch price.
export function TradePanel({
  gameTitle,
  flag,
  selection,
  ladder,
  lastYes,
  isOpen,
  loggedIn,
  minOrderSize = 1,
  yesShares,
  noShares,
  outcome,
  onOutcomeChange,
}: {
  gameTitle: string
  flag: string
  selection: PanelSelection
  ladder: Ladder
  lastYes: number
  isOpen: boolean
  loggedIn: boolean
  minOrderSize?: number
  yesShares: number
  noShares: number
  /** controlled: board row Yes/No buttons drive this too */
  outcome: Outcome
  onOutcomeChange: (o: Outcome) => void
}) {
  const [side, setSide] = useState<OrderSide>("BUY")
  const setOutcome = onOutcomeChange
  const [mode, setMode] = useState<"MARKET" | "LIMIT">("MARKET")
  const [amount, setAmount] = useState("0")
  const [price, setPrice] = useState("50")
  const [shares, setShares] = useState("10")
  const [formError, setFormError] = useState<string | null>(null)
  const [state, formAction, pending] = useActionState<ActionState, FormData>(placeOrder, null)

  // one idempotency key per order intent (P0-7)
  const intentRef = useRef<string | null>(null)
  useEffect(() => {
    if (state?.success || state?.error) intentRef.current = null
  }, [state])

  const bestAskYes = ladder.asks[0]?.price
  const bestBidYes = ladder.bids[0]?.price
  const yesBuyPrice = bestAskYes ?? lastYes
  const noBuyPrice = clampPrice(1 - (bestBidYes ?? lastYes))
  const ownedShares = outcome === "YES" ? yesShares : noShares

  // touch price for a market order on the selected outcome, in outcome terms
  function touchPrice(): number | null {
    if (side === "BUY") {
      if (outcome === "YES") return bestAskYes ?? null
      return bestBidYes !== undefined ? clampPrice(1 - bestBidYes) : null
    }
    if (outcome === "YES") return bestBidYes ?? null
    return bestAskYes !== undefined ? clampPrice(1 - bestAskYes) : null
  }

  const amountNum = Number(amount) || 0
  const sharesNum = Number(shares) || 0
  const priceNum = Math.min(99, Math.max(1, Number(price) || 0)) / 100
  const touch = touchPrice()

  // what actually gets sent: market buys convert $ -> shares at the touch
  const orderShares =
    side === "BUY" && mode === "MARKET"
      ? touch
        ? Math.floor((amountNum / touch) * 100) / 100
        : 0
      : sharesNum
  const orderPrice = mode === "MARKET" ? touch : priceNum
  const toWin = side === "BUY" ? orderShares : null

  function handleSubmit(formData: FormData) {
    setFormError(null)
    if (mode === "MARKET" && touch === null) {
      setFormError("No liquidity on the other side right now.")
      return
    }
    if (orderShares < minOrderSize) {
      setFormError(
        side === "BUY" && mode === "MARKET"
          ? `Amount too small — minimum ~$${(minOrderSize * (touch ?? 1)).toFixed(2)}.`
          : `Minimum order is ${minOrderSize} shares.`
      )
      return
    }
    intentRef.current ??= crypto.randomUUID()
    formData.set("clientOrderId", intentRef.current)
    formData.set("marketId", selection.marketId)
    formData.set("outcome", outcome)
    formData.set("side", side)
    formData.set("size", String(orderShares))
    formData.set("price", String(orderPrice))
    formData.set("ioc", mode === "MARKET" ? "true" : "false")
    formData.set("fok", "false")
    formAction(formData)
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 shadow-lg shadow-black/20">
      <div className="flex items-center gap-2.5">
        <span className="text-3xl leading-none" aria-hidden="true">
          {flag}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm text-muted-foreground">{gameTitle}</div>
          <div className="truncate text-[15px] font-bold leading-tight">{selection.label}</div>
        </div>
      </div>

      {isOpen ? (
        <>
          <div className="mt-3 flex items-center justify-between border-b border-border/60">
            <div className="flex gap-5">
              {(["BUY", "SELL"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSide(s)}
                  className={cn(
                    "-mb-px border-b-2 pb-2 text-[15px] font-semibold transition-colors",
                    side === s
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {s === "BUY" ? "Buy" : "Sell"}
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
            {mode === "LIMIT" && (
              <div className="mb-3 flex items-center justify-between">
                <label htmlFor="wc-price" className="text-[15px] font-semibold">
                  Limit Price
                </label>
                <div className="flex items-center gap-1">
                  <input
                    id="wc-price"
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

            {side === "BUY" && mode === "MARKET" ? (
              <>
                <div className="flex items-center justify-between gap-4">
                  <label htmlFor="wc-amount" className="text-[15px] font-semibold">
                    Amount
                  </label>
                  <div className="flex min-w-0 flex-1 items-center justify-end">
                    <span className="text-3xl font-bold text-muted-foreground/60">$</span>
                    <input
                      id="wc-amount"
                      type="number"
                      min={0}
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="h-12 w-32 bg-transparent text-right text-3xl font-bold tabular-nums text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="mt-1 flex justify-end gap-1.5">
                  {[1, 5, 10, 100].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setAmount(String(Math.round(((Number(amount) || 0) + n) * 100) / 100))}
                      className="rounded-md bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground/80 transition-colors hover:bg-secondary/70"
                    >
                      +${n}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-4">
                  <label htmlFor="wc-shares" className="text-[15px] font-semibold">
                    Shares
                  </label>
                  <input
                    id="wc-shares"
                    type="number"
                    min={minOrderSize}
                    step="0.01"
                    value={shares}
                    onChange={(e) => setShares(e.target.value)}
                    className="h-12 min-w-0 flex-1 bg-transparent text-right text-3xl font-bold tabular-nums text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                  />
                </div>
                <div className="mt-1 flex justify-end gap-1.5">
                  {side === "SELL"
                    ? [25, 50, 75, 100].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setShares(String(Math.floor(ownedShares * pct) / 100))}
                          className="rounded-md bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground/80 transition-colors hover:bg-secondary/70"
                        >
                          {pct === 100 ? "Max" : `${pct}%`}
                        </button>
                      ))
                    : [10, 50, 100].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setShares(String((Number(shares) || 0) + n))}
                          className="rounded-md bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground/80 transition-colors hover:bg-secondary/70"
                        >
                          +{n}
                        </button>
                      ))}
                </div>
              </>
            )}

            <div className="mt-3 min-h-4 text-xs text-muted-foreground">
              {side === "BUY" && mode === "MARKET" ? (
                touch !== null && orderShares > 0 ? (
                  <>
                    ~{formatShares(orderShares)} {outcome === "YES" ? "Yes" : "No"} at{" "}
                    {Math.round(touch * 100)}&cent; &middot;{" "}
                    <span className="font-semibold text-yes">To win ${formatShares(toWin ?? 0)}</span>
                  </>
                ) : (
                  <>Fills at the best available price; the remainder is cancelled.</>
                )
              ) : side === "BUY" ? (
                <>
                  Escrow ${(priceNum * sharesNum).toFixed(2)} &middot; pays ${formatShares(sharesNum)}{" "}
                  if {selection.label} {outcome === "YES" ? "hits" : "misses"}
                </>
              ) : (
                <>You hold {formatShares(ownedShares)} {outcome === "YES" ? "Yes" : "No"} shares.</>
              )}
            </div>

            {formError && <p className="mt-2 text-sm text-destructive">{formError}</p>}
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
        <p className="mt-4 rounded-lg bg-secondary px-3 py-2.5 text-sm font-semibold text-muted-foreground">
          Trading closed for this market.
        </p>
      )}

      <p className="mt-3 text-center text-xs text-muted-foreground">
        By trading, you agree to the <span className="underline">Terms of Use</span>.
      </p>
    </div>
  )
}
