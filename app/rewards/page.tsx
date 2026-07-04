import Link from "next/link"
import { Flame, Gift } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { CurrencyAmount } from "@/components/currency-amount"
import { ClaimButton } from "./claim-button"

export const metadata = { title: "Rewards — Kalo" }

const HOURS = 60 * 60 * 1000

type Claim = { claimed_at: string; streak: number }

function claimState(last: Claim | undefined) {
  const now = Date.now()
  const lastAt = last ? new Date(last.claimed_at).getTime() : 0
  const canClaim = !last || now - lastAt >= 20 * HOURS
  const streakAlive = !!last && now - lastAt < 48 * HOURS
  const nextStreak = last && streakAlive ? Math.min(last.streak + 1, 30) : 1
  const nextAmount = 100 + Math.min(nextStreak - 1, 7) * 25
  return { lastAt, canClaim, streakAlive, nextAmount }
}

export default async function RewardsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <Gift className="mx-auto size-10 text-yes" />
        <h1 className="mt-3 text-2xl font-bold tracking-tight">Daily rewards</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Claim free play money every day — streaks pay more. Log in to start claiming.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex h-11 items-center rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Log In
        </Link>
      </div>
    )
  }

  const [{ data: profile }, { data: claims }] = await Promise.all([
    supabase.from("profiles").select("balance, display_name").eq("id", user.id).single(),
    supabase
      .from("faucet_claims")
      .select("*")
      .eq("user_id", user.id)
      .order("claimed_at", { ascending: false })
      .limit(10),
  ])

  const history = claims ?? []
  const last = history[0]
  const { lastAt, canClaim, streakAlive, nextAmount } = claimState(last)

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <div className="flex items-center gap-2.5">
        <Gift className="size-6 text-yes" />
        <h1 className="text-2xl font-bold tracking-tight">Rewards</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        A free play-money grant every day. Claim on consecutive days to build a streak — each
        day adds $25, up to $275/day.
      </p>

      <div className="mt-6 rounded-xl border border-border/60 bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Your cash</div>
            <CurrencyAmount usd={profile?.balance ?? 0} className="text-2xl font-bold" />
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Streak</div>
            <div className="flex items-center justify-end gap-1 text-2xl font-bold">
              <Flame className="size-5 text-no" />
              {streakAlive && last ? last.streak : 0}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <ClaimButton canClaim={canClaim} amount={nextAmount} />
        </div>

        {!canClaim && last && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Next claim{" "}
            {new Date(lastAt + 20 * HOURS).toLocaleString(undefined, {
              hour: "numeric",
              minute: "2-digit",
              month: "short",
              day: "numeric",
            })}
            {streakAlive && ` — claim within 48h of the last one to keep the streak`}
          </p>
        )}
      </div>

      {history.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Claim history
          </h2>
          <div className="mt-2 divide-y divide-border/40 rounded-xl border border-border/60 bg-card px-4">
            {history.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-muted-foreground">
                  {new Date(c.claimed_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">streak {c.streak}</span>
                  <span className="font-semibold text-yes">
                    +<CurrencyAmount usd={c.amount} className="text-sm font-semibold" />
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-6 rounded-lg border border-border/60 bg-secondary/30 p-3 text-xs leading-relaxed text-muted-foreground">
        This is play money. It has no cash value, cannot be bought, sold, transferred, or
        withdrawn, and never converts to anything of value. Kalo is for entertainment and
        education only.
      </p>
    </div>
  )
}
