import { notFound } from "next/navigation"
import { Bookmark, CodeXml, Link2 } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { MarketThumb } from "@/components/market-card"
import { toYesLadder, tradeYesPrice } from "@/lib/orderbook"
import type { OrderBookLevel, Trade, Position, Outcome } from "@/lib/types"
import { RealtimeRefresher } from "./realtime-refresher"
import { MarketWorkspace, type TapeEntry } from "./market-workspace"
import { SplitMergePanel } from "./split-merge-panel"
import { RedeemPanel } from "./redeem-panel"
import { ResolveMarketButtons } from "@/app/admin/resolve-market-buttons"

export default async function MarketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ buy?: string }>
}) {
  const { id } = await params
  const { buy } = await searchParams
  const initialOutcome: Outcome = buy === "NO" ? "NO" : "YES"
  const supabase = await createClient()

  const [{ data: market }, { data: bookRows }, { data: trades }, {
    data: { user },
  }] = await Promise.all([
    supabase.from("markets").select("*").eq("id", id).single(),
    supabase.rpc("get_order_book", { p_market_id: id }),
    supabase.from("trades").select("*").eq("market_id", id).order("created_at", { ascending: false }).limit(200),
    supabase.auth.getUser(),
  ])

  if (!market) {
    notFound()
  }

  let balance = 0
  let positions: Position[] = []
  let isAdmin = false
  if (user) {
    const [{ data: profile }, { data: pos }] = await Promise.all([
      supabase.from("profiles").select("balance, is_admin").eq("id", user.id).single(),
      supabase.from("positions").select("*").eq("market_id", id).eq("user_id", user.id),
    ])
    balance = profile?.balance ?? 0
    isAdmin = profile?.is_admin ?? false
    positions = pos ?? []
  }

  const book: OrderBookLevel[] = bookRows ?? []
  const marketTrades: Trade[] = trades ?? []
  const ladder = toYesLadder(book)
  const points = [...marketTrades]
    .reverse()
    .map((t) => ({ t: new Date(t.created_at).getTime(), p: tradeYesPrice(t) }))
  const volume = marketTrades.reduce((sum, t) => sum + t.price * t.size, 0)
  const tape: TapeEntry[] = marketTrades.slice(0, 30).map((t) => ({
    id: t.id,
    priceYes: tradeYesPrice(t),
    size: t.size,
    kind: t.kind,
    createdAt: t.created_at,
  }))

  const yesShares = positions.find((p) => p.outcome === "YES")?.shares ?? 0
  const noShares = positions.find((p) => p.outcome === "NO")?.shares ?? 0
  const resolvedOutcome = market.resolved_outcome as Outcome | null
  const isOpen = market.status === "open"

  const sidebarExtras = (
    <>
      {user && isOpen && (
        <SplitMergePanel marketId={id} balance={balance} yesShares={yesShares} noShares={noShares} />
      )}
      {user && !isOpen && market.status === "resolved" && (
        <RedeemPanel marketId={id} outcome={resolvedOutcome} yesShares={yesShares} noShares={noShares} />
      )}
      {isAdmin && isOpen && (
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Admin
          </div>
          <ResolveMarketButtons marketId={id} question={market.question} />
        </div>
      )}
    </>
  )

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6">
      {isOpen && <RealtimeRefresher marketId={id} />}

      <div className="mb-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{market.category ?? "General"}</span>
          {market.status === "resolved" && (
            <>
              <span aria-hidden="true">&middot;</span>
              <span className={resolvedOutcome === "YES" ? "text-yes" : "text-no"}>
                Resolved {resolvedOutcome === "YES" ? "Yes" : "No"}
              </span>
            </>
          )}
        </div>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <MarketThumb category={market.category} size={60} className="rounded-xl" />
            <h1 className="text-2xl font-bold leading-snug tracking-tight sm:text-3xl">
              {market.question}
            </h1>
          </div>
          <div className="mt-2 flex shrink-0 items-center gap-3 text-muted-foreground">
            <CodeXml className="size-4.5 transition-colors hover:text-foreground" />
            <Link2 className="size-4.5 transition-colors hover:text-foreground" />
            <Bookmark className="size-4.5 transition-colors hover:text-foreground" />
          </div>
        </div>
      </div>

      <MarketWorkspace
        marketId={id}
        question={market.question}
        category={market.category}
        description={market.description}
        closeAt={market.close_at}
        isOpen={isOpen}
        resolvedOutcome={resolvedOutcome}
        points={points}
        ladder={ladder}
        tape={tape}
        volume={volume}
        yesShares={yesShares}
        noShares={noShares}
        loggedIn={!!user}
        initialOutcome={initialOutcome}
        sidebarExtras={sidebarExtras}
      />
    </div>
  )
}
