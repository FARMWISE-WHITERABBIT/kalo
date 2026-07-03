"use client"

import { useActionState } from "react"
import { cancelOrder, type ActionState } from "@/app/actions/trading"
import { Button } from "@/components/ui/button"

export function CancelOrderButton({ orderId, marketId }: { orderId: string; marketId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(cancelOrder, null)

  return (
    <form action={formAction}>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="marketId" value={marketId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {pending ? "Cancelling…" : "Cancel"}
      </Button>
      {state?.error && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  )
}
