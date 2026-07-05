"use client"

import { useActionState } from "react"
import { createGame, resolveGame } from "@/app/actions/games"
import type { ActionState } from "@/app/actions/trading"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { flagFor, type Game } from "@/lib/world-cup"

function ResolveGameRow({ game }: { game: Game }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(resolveGame, null)

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3 p-4">
      <input type="hidden" name="gameId" value={game.id} />
      <span className="min-w-0 flex-1 text-sm">
        <span aria-hidden="true">{flagFor(game.home_code)}</span> {game.home_team} vs{" "}
        {game.away_team} <span aria-hidden="true">{flagFor(game.away_code)}</span>
        <span className="ml-2 text-xs text-muted-foreground">
          {new Date(game.kickoff_at).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      </span>
      <div className="flex items-center gap-1.5">
        <Input
          name="homeGoals"
          type="number"
          min={0}
          step={1}
          placeholder={game.home_code}
          className="h-8 w-16 text-center"
          required
        />
        <span className="text-muted-foreground">–</span>
        <Input
          name="awayGoals"
          type="number"
          min={0}
          step={1}
          placeholder={game.away_code}
          className="h-8 w-16 text-center"
          required
        />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Settling…" : "Settle"}
        </Button>
      </div>
      {state?.error && <p className="w-full text-sm text-destructive">{state.error}</p>}
      {state?.success && <p className="w-full text-sm text-yes">Game settled — all six markets resolved.</p>}
    </form>
  )
}

// Admin World Cup desk: add a fixture (mints its six-market set with bot
// priors) and settle finished games by final score.
export function WorldCupPanel({ games }: { games: Game[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createGame, null)
  const unfinished = games.filter((g) => g.status !== "finished")

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Add World Cup fixture</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-3" key={state?.success ? "reset" : "form"}>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="homeTeam">Home team</Label>
                <Input id="homeTeam" name="homeTeam" placeholder="Brazil" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="awayTeam">Away team</Label>
                <Input id="awayTeam" name="awayTeam" placeholder="Norway" required />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label htmlFor="homeCode">Home code</Label>
                <Input id="homeCode" name="homeCode" placeholder="BRA" maxLength={3} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="awayCode">Away code</Label>
                <Input id="awayCode" name="awayCode" placeholder="NOR" maxLength={3} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="homePrior">Home win prob</Label>
                <Input id="homePrior" name="homePrior" type="number" step="0.01" min="0.01" max="0.97" placeholder="0.54" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="drawPrior">Draw prob</Label>
                <Input id="drawPrior" name="drawPrior" type="number" step="0.01" min="0.01" max="0.97" placeholder="0.27" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="stage">Stage</Label>
                <Input id="stage" name="stage" placeholder="Round of 32" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="kickoff">Kickoff</Label>
                <Input id="kickoff" name="kickoff" type="datetime-local" required />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Creates the fixture plus its six binary markets (moneyline ×3, spread, total,
              both-teams-to-score) closing 2h after kickoff, with the bot fleet quoting your
              priors from the first tick.
            </p>
            {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
            {state?.success && <p className="text-sm text-yes">Fixture and market set created.</p>}
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Add fixture"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Settle games</CardTitle>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {unfinished.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No games awaiting a result.</p>
          )}
          {unfinished.map((g) => (
            <ResolveGameRow key={g.id} game={g} />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
