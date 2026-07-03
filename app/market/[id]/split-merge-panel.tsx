"use client"

import { useActionState, useState } from "react"
import { splitShares, mergeShares, type ActionState } from "@/app/actions/trading"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function SplitMergePanel({
  marketId,
  balance,
  yesShares,
  noShares,
}: {
  marketId: string
  balance: number
  yesShares: number
  noShares: number
}) {
  const [mode, setMode] = useState<"split" | "merge">("split")
  const [splitState, splitAction, splitPending] = useActionState<ActionState, FormData>(splitShares, null)
  const [mergeState, mergeAction, mergePending] = useActionState<ActionState, FormData>(mergeShares, null)
  const maxMerge = Math.min(yesShares, noShares)

  return (
    <Card className="py-4">
      <CardHeader className="px-4 pb-2">
        <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Split / Merge</CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <Tabs value={mode} onValueChange={(v) => setMode(v as "split" | "merge")}>
          <TabsList className="w-full">
            <TabsTrigger value="split" className="flex-1">
              Split
            </TabsTrigger>
            <TabsTrigger value="merge" className="flex-1">
              Merge
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === "split" ? (
          <form action={splitAction} className="mt-4 space-y-3">
            <input type="hidden" name="marketId" value={marketId} />
            <div className="space-y-1">
              <Label htmlFor="amount">Amount ($, balance {balance.toFixed(2)})</Label>
              <Input id="amount" name="amount" type="number" min={0} step="0.01" defaultValue="10" />
            </div>
            <p className="text-xs text-muted-foreground">Mints equal YES + NO shares 1:1 from your balance.</p>
            {splitState?.error && <p className="text-sm text-destructive">{splitState.error}</p>}
            <Button type="submit" className="w-full" variant="outline" disabled={splitPending}>
              {splitPending ? "Splitting…" : "Split"}
            </Button>
          </form>
        ) : (
          <form action={mergeAction} className="mt-4 space-y-3">
            <input type="hidden" name="marketId" value={marketId} />
            <div className="space-y-1">
              <Label htmlFor="shares">Shares (max {maxMerge.toFixed(2)})</Label>
              <Input id="shares" name="shares" type="number" min={0} step="0.01" defaultValue={Math.min(10, maxMerge)} />
            </div>
            <p className="text-xs text-muted-foreground">Burns equal YES + NO shares back into balance.</p>
            {mergeState?.error && <p className="text-sm text-destructive">{mergeState.error}</p>}
            <Button type="submit" className="w-full" variant="outline" disabled={mergePending}>
              {mergePending ? "Merging…" : "Merge"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
