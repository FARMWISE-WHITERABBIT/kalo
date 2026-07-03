"use client"

import { useActionState, useState } from "react"
import { placeOrder, type ActionState } from "@/app/actions/trading"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCash } from "@/lib/utils"
import type { Outcome, OrderSide } from "@/lib/types"

export function TradePanel({
  marketId,
  yesShares,
  noShares,
}: {
  marketId: string
  yesShares: number
  noShares: number
}) {
  const [outcome, setOutcome] = useState<Outcome>("YES")
  const [side, setSide] = useState<OrderSide>("BUY")
  const [price, setPrice] = useState("60")
  const [size, setSize] = useState("10")
  const [state, formAction, pending] = useActionState<ActionState, FormData>(placeOrder, null)

  const priceCents = Math.min(99, Math.max(1, Number(price) || 0))
  const priceNum = priceCents / 100
  const sizeNum = Number(size) || 0
  const ownedShares = outcome === "YES" ? yesShares : noShares

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Trade</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={outcome} onValueChange={(v) => setOutcome(v as Outcome)}>
          <TabsList className="w-full">
            <TabsTrigger value="YES" className="flex-1">
              YES
            </TabsTrigger>
            <TabsTrigger value="NO" className="flex-1">
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

        <form action={formAction} className="mt-4 space-y-3">
          <input type="hidden" name="marketId" value={marketId} />
          <input type="hidden" name="outcome" value={outcome} />
          <input type="hidden" name="side" value={side} />
          <input type="hidden" name="price" value={priceNum} />

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

          <p className="text-xs text-muted-foreground">
            {side === "BUY"
              ? `Costs up to ${formatCash(priceNum * sizeNum)}`
              : `You hold ${ownedShares.toFixed(2)} ${outcome} shares`}
          </p>

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          {state?.success && <p className="text-sm text-green-600">Order placed.</p>}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Placing…" : `${side === "BUY" ? "Buy" : "Sell"} ${outcome}`}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
