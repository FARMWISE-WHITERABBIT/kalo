"use client"

import { useActionState, useState } from "react"
import { placeOrder, type ActionState } from "@/app/actions/trading"
import { OrderLadder } from "@/components/order-ladder"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CurrencyAmount } from "@/components/currency-amount"
import type { Ladder } from "@/lib/orderbook"
import type { Outcome, OrderSide } from "@/lib/types"

export function MarketWorkspace({
  marketId,
  ladder,
  yesShares,
  noShares,
  initialOutcome = "YES",
}: {
  marketId: string
  ladder: Ladder
  yesShares: number
  noShares: number
  initialOutcome?: Outcome
}) {
  const [outcome, setOutcome] = useState<Outcome>(initialOutcome)
  const [side, setSide] = useState<OrderSide>("BUY")
  const [mode, setMode] = useState<"LIMIT" | "MARKET">("LIMIT")
  const [price, setPrice] = useState("50")
  const [size, setSize] = useState("10")
  const [marketError, setMarketError] = useState<string | null>(null)
  const [state, formAction, pending] = useActionState<ActionState, FormData>(placeOrder, null)

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

  // marketable price computed from the current ladder for MARKET/IOC orders
  function marketablePrice(): number | null {
    if (side === "BUY") {
      if (ladder.asks.length === 0) return null
      const bestYes = ladder.asks[0].price // lowest ask
      return outcome === "YES" ? bestYes : Math.min(0.99, Math.max(0.01, 1 - bestYes))
    } else {
      if (ladder.bids.length === 0) return null
      const bestYes = ladder.bids[0].price // highest bid
      return outcome === "YES" ? bestYes : Math.min(0.99, Math.max(0.01, 1 - bestYes))
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

  return (
    <>
      <OrderLadder ladder={ladder} yesShares={yesShares} onPick={onPick} />

      <Card className="py-4">
        <CardHeader className="px-4 pb-2">
          <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Order ticket</CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          <Tabs value={outcome} onValueChange={(v) => setOutcome(v as Outcome)}>
            <TabsList className="w-full">
              <TabsTrigger value="YES" className="flex-1 data-[state=active]:text-yes">
                YES
              </TabsTrigger>
              <TabsTrigger value="NO" className="flex-1 data-[state=active]:text-no">
                NO
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Tabs value={side} onValueChange={(v) => setSide(v as OrderSide)} className="mt-3">
            <TabsList className="w-full">
              <TabsTrigger value="BUY" className="flex-1">
                Buy
              </TabsTrigger>
              <TabsTrigger value="SELL" className="flex-1">
                Sell
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Tabs value={mode} onValueChange={(v) => setMode(v as "LIMIT" | "MARKET")} className="mt-3">
            <TabsList className="w-full">
              <TabsTrigger value="LIMIT" className="flex-1">
                Limit
              </TabsTrigger>
              <TabsTrigger value="MARKET" className="flex-1">
                Market
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <form action={handleSubmit} className="mt-4 space-y-3">
            <input type="hidden" name="marketId" value={marketId} />
            <input type="hidden" name="outcome" value={outcome} />
            <input type="hidden" name="side" value={side} />

            {mode === "LIMIT" && (
              <div className="space-y-1">
                <Label htmlFor="price-input">Limit price (¢)</Label>
                <Input
                  id="price-input"
                  type="number"
                  min={1}
                  max={99}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="size">Shares</Label>
              <Input
                id="size"
                name="size"
                type="number"
                min={0}
                step="0.01"
                value={size}
                onChange={(e) => setSize(e.target.value)}
              />
            </div>

            <div className="text-xs text-muted-foreground">
              {mode === "MARKET" ? (
                <>Fills at the best available price, remainder cancelled.</>
              ) : side === "BUY" ? (
                <>
                  Escrow: <CurrencyAmount usd={priceNum * sizeNum} className="text-foreground" /> · pays{" "}
                  <CurrencyAmount usd={sizeNum} className="text-foreground" /> if {outcome} resolves true
                </>
              ) : (
                <>You hold {ownedShares.toFixed(2)} {outcome} in this market.</>
              )}
            </div>

            {marketError && <p className="text-sm text-destructive">{marketError}</p>}
            {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
            {state?.success && <p className="text-sm text-green-500">Order placed.</p>}

            <Button
              type="submit"
              className={
                outcome === "YES"
                  ? "w-full bg-yes text-[#10131f] hover:bg-yes/90"
                  : "w-full bg-no text-[#10131f] hover:bg-no/90"
              }
              disabled={pending}
            >
              {pending ? "Placing…" : `${side === "BUY" ? "Buy" : "Sell"} ${outcome}`}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  )
}
