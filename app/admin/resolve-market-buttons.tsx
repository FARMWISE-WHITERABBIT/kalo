"use client"

import { useActionState, useRef } from "react"
import { resolveMarket } from "@/app/actions/admin"
import type { ActionState } from "@/app/actions/trading"
import { Button } from "@/components/ui/button"

export function ResolveMarketButtons({ marketId, question }: { marketId: string; question: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(resolveMarket, null)
  const outcomeRef = useRef<HTMLInputElement>(null)

  function resolve(outcome: "YES" | "NO", formEl: HTMLFormElement) {
    if (!confirm(`Resolve "${question}" as ${outcome}? This closes the market and cannot be undone.`)) {
      return
    }
    if (outcomeRef.current) outcomeRef.current.value = outcome
    formEl.requestSubmit()
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="marketId" value={marketId} />
      <input type="hidden" name="outcome" ref={outcomeRef} />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={(e) => resolve("YES", e.currentTarget.form!)}
      >
        Resolve YES
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={(e) => resolve("NO", e.currentTarget.form!)}
      >
        Resolve NO
      </Button>
      {state?.error && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  )
}
