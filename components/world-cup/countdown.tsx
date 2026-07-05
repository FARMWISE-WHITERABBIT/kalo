"use client"

import { useNow } from "@/lib/use-now"
import { cn } from "@/lib/utils"

// Kickoff countdown ("18h 41m"), switching to a live badge during the match
// window and the final score once the game is finished. Renders nothing
// meaningful until hydration (useNow is null on the server) — the kickoff
// date string beside it carries the SSR content.
export function Countdown({
  kickoffAt,
  status,
  homeScore,
  awayScore,
  className,
}: {
  kickoffAt: string
  status: string
  homeScore: number | null
  awayScore: number | null
  className?: string
}) {
  const now = useNow()

  if (status === "finished") {
    return (
      <span className={cn("font-semibold text-muted-foreground", className)}>
        Final{homeScore !== null && awayScore !== null ? ` ${homeScore}–${awayScore}` : ""}
      </span>
    )
  }

  const kickoff = new Date(kickoffAt).getTime()
  if (now === null) return <span className={className} />

  const diff = kickoff - now
  if (diff <= 0) {
    return (
      <span className={cn("flex items-center gap-1.5 font-semibold text-no", className)}>
        <span className="relative flex size-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-no opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-no" />
        </span>
        Live
      </span>
    )
  }

  const mins = Math.floor(diff / 60000)
  const label =
    mins >= 24 * 60
      ? `${Math.floor(mins / (24 * 60))}d ${Math.floor((mins % (24 * 60)) / 60)}h`
      : mins >= 60
        ? `${Math.floor(mins / 60)}h ${mins % 60}m`
        : `${mins}m`

  return <span className={cn("font-semibold tabular-nums", className)}>{label}</span>
}
