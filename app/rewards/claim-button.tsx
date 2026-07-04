"use client"

import { useState, useTransition } from "react"
import { Gift } from "lucide-react"
import { claimFaucet } from "@/app/actions/rewards"
import type { ActionState } from "@/app/actions/trading"

export function ClaimButton({ canClaim, amount }: { canClaim: boolean; amount: number }) {
  const [result, setResult] = useState<ActionState>(null)
  const [pending, startTransition] = useTransition()

  function onClaim() {
    startTransition(async () => {
      setResult(await claimFaucet())
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClaim}
        disabled={!canClaim || pending}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Gift className="size-5" />
        {pending ? "Claiming…" : canClaim ? `Claim today's $${amount}` : "Claimed — come back tomorrow"}
      </button>
      {result?.error && <p className="mt-2 text-sm text-destructive">{result.error}</p>}
      {result?.success && <p className="mt-2 text-sm text-yes">Claimed! Balance updated.</p>}
    </div>
  )
}
