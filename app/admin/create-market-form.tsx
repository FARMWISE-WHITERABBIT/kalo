"use client"

import { useActionState } from "react"
import { createMarket } from "@/app/actions/admin"
import type { ActionState } from "@/app/actions/trading"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function CreateMarketForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createMarket, null)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Create market</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-3" key={state?.success ? "reset" : "form"}>
          <div className="space-y-1">
            <Label htmlFor="question">Question</Label>
            <Input id="question" name="question" placeholder="Will X happen by Y?" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" placeholder="Resolution criteria (optional)" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="category">Category</Label>
              <Input id="category" name="category" placeholder="e.g. Sports" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="closeAt">Closes</Label>
              <Input id="closeAt" name="closeAt" type="datetime-local" />
            </div>
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          {state?.success && <p className="text-sm text-green-600">Market created.</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create market"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
