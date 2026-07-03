"use client"

import { useActionState } from "react"
import { redeemMarket, type ActionState } from "@/app/actions/trading"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatShares } from "@/lib/utils"
import type { Outcome } from "@/lib/types"

export function RedeemPanel({
  marketId,
  outcome,
  yesShares,
  noShares,
}: {
  marketId: string
  outcome: Outcome | null
  yesShares: number
  noShares: number
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(redeemMarket, null)
  const winningShares = outcome === "YES" ? yesShares : outcome === "NO" ? noShares : 0

  return (
    <Card className="py-4">
      <CardHeader className="px-4 pb-2">
        <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Redeem</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        <p className="text-sm text-muted-foreground">
          Market resolved {outcome}. You hold {formatShares(winningShares)} winning shares.
        </p>
        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
        {state?.success && <p className="text-sm text-green-600">Redeemed.</p>}
        <form action={formAction}>
          <input type="hidden" name="marketId" value={marketId} />
          <Button type="submit" className="w-full" disabled={pending || winningShares <= 0}>
            {pending ? "Redeeming…" : "Redeem"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
