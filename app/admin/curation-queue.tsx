"use client"

import { useActionState } from "react"
import { Check, ExternalLink, Newspaper, X } from "lucide-react"
import {
  approveProposal,
  rejectProposal,
  acceptResolution,
  dismissResolution,
} from "@/app/actions/curation"
import type { ActionState } from "@/app/actions/trading"
import { cn } from "@/lib/utils"

export type CurationQueue = {
  proposals: {
    id: number
    question: string
    criteria: string
    category: string
    source_url: string
    close_at: string | null
    created_at: string
  }[]
  resolutions: {
    id: number
    market_id: string
    question: string
    outcome: "YES" | "NO"
    rationale: string
    evidence_url: string | null
    created_at: string
  }[]
  news_24h: number
  fleet: number
}

function ActionButtons({
  id,
  approveAction,
  rejectAction,
  approveLabel,
}: {
  id: number
  approveAction: (prev: ActionState, fd: FormData) => Promise<ActionState>
  rejectAction: (prev: ActionState, fd: FormData) => Promise<ActionState>
  approveLabel: string
}) {
  const [aState, aAction, aPending] = useActionState<ActionState, FormData>(approveAction, null)
  const [rState, rAction, rPending] = useActionState<ActionState, FormData>(rejectAction, null)
  const pending = aPending || rPending

  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
      <div className="flex gap-1.5">
        <form action={aAction}>
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            disabled={pending}
            className="flex h-8 items-center gap-1 rounded-lg bg-yes px-3 text-xs font-semibold text-white hover:bg-yes/90 disabled:opacity-50"
          >
            <Check className="size-3.5" />
            {approveLabel}
          </button>
        </form>
        <form action={rAction}>
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            disabled={pending}
            className="flex h-8 items-center gap-1 rounded-lg bg-secondary px-3 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <X className="size-3.5" />
            Reject
          </button>
        </form>
      </div>
      {(aState?.error || rState?.error) && (
        <p className="max-w-56 text-right text-xs text-destructive">
          {aState?.error ?? rState?.error}
        </p>
      )}
    </div>
  )
}

export function CurationQueuePanel({ queue }: { queue: CurationQueue }) {
  return (
    <section className="rounded-xl border border-border/60 bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Newspaper className="size-5 text-primary" />
          News curation queue
        </h2>
        <span className="text-xs text-muted-foreground">
          {queue.news_24h} news items · 24h &middot; fleet of {queue.fleet} bots
        </span>
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Proposed markets ({queue.proposals.length})
        </h3>
        {queue.proposals.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing pending. The news engine files proposals here; markets only go live when you
            approve them.
          </p>
        ) : (
          <div className="mt-2 divide-y divide-border/40">
            {queue.proposals.map((p) => (
              <div key={p.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold leading-snug">{p.question}</div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.criteria}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="rounded bg-secondary px-1.5 py-0.5 font-medium">{p.category}</span>
                    {p.close_at && <span>closes {new Date(p.close_at).toLocaleDateString()}</span>}
                    <a
                      href={p.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      source <ExternalLink className="size-3" />
                    </a>
                  </div>
                </div>
                <ActionButtons
                  id={p.id}
                  approveAction={approveProposal}
                  rejectAction={rejectProposal}
                  approveLabel="Approve"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Suggested resolutions ({queue.resolutions.length})
        </h3>
        {queue.resolutions.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            When news definitively settles a market, the engine suggests the verdict here with
            evidence — resolving still requires your click.
          </p>
        ) : (
          <div className="mt-2 divide-y divide-border/40">
            {queue.resolutions.map((s) => (
              <div key={s.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold leading-snug">{s.question}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 font-semibold",
                        s.outcome === "YES" ? "bg-yes/15 text-yes" : "bg-no/15 text-no"
                      )}
                    >
                      Resolve {s.outcome === "YES" ? "Yes" : "No"}
                    </span>
                    <span className="text-muted-foreground">{s.rationale}</span>
                    {s.evidence_url && (
                      <a
                        href={s.evidence_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-primary hover:underline"
                      >
                        evidence <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </div>
                <ActionButtons
                  id={s.id}
                  approveAction={acceptResolution}
                  rejectAction={dismissResolution}
                  approveLabel="Resolve"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
