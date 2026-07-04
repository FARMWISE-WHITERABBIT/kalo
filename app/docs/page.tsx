import Link from "next/link"
import { BookOpen } from "lucide-react"

export const metadata = { title: "Documentation — Kalo" }

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-10 scroll-mt-24">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-foreground/80">{children}</div>
    </section>
  )
}

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center gap-2.5">
        <BookOpen className="size-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Documentation</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        How the Kalo exchange works under the hood. Play money only — nothing here has cash value.
      </p>

      <Section title="Event contracts">
        <p>
          Every Kalo market is a binary event contract: a YES share pays $1 of play money if the
          event happens, $0 if it doesn&rsquo;t; a NO share pays the reverse. Every YES+NO pair in
          existence is backed by exactly $1 of locked collateral, so the price of YES is the
          market&rsquo;s implied probability of the event.
        </p>
      </Section>

      <Section title="The order book">
        <p>
          Kalo runs a central limit order book with price&ndash;time priority, kept in unified YES
          terms: an order on NO at price q is the same economic position as the opposite order on
          YES at 1&nbsp;&minus;&nbsp;q, so both outcomes share one book and one spread. Placing a
          BUY escrows price&nbsp;&times;&nbsp;size of cash; placing a SELL escrows the shares.
          Cancelling refunds the remaining escrow exactly.
        </p>
        <p>Each fill settles one of three canonical ways:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Transfer</strong> — a buyer and seller of the same outcome swap existing shares
            for cash.
          </li>
          <li>
            <strong>Mint</strong> — a YES buyer and a NO buyer whose prices sum to at least $1
            jointly fund a brand-new pair; open interest grows.
          </li>
          <li>
            <strong>Merge</strong> — a YES seller and a NO seller surrender a pair, which is burned
            for its $1 collateral, split between them; open interest shrinks.
          </li>
        </ul>
        <p>
          The engine always fills the taker at the best effective price available across all three
          paths; the resting maker fills at their own limit, and the taker keeps any improvement.
        </p>
      </Section>

      <Section title="Order types">
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>Limit (GTC)</strong> — rests on the book until filled or cancelled.</li>
          <li><strong>Market (FAK)</strong> — fills what it can at the best price, cancels the rest.</li>
          <li><strong>Limit · FOK</strong> — fills completely at the limit or better, or cancels entirely.</li>
          <li><strong>Limit · GTD</strong> — rests until a chosen expiry, then auto-cancels with a full refund.</li>
        </ul>
        <p>
          Prices sit on a 1&cent; grid between 1&cent; and 99&cent;; the minimum order is 1.00
          shares with at most two decimal places.
        </p>
      </Section>

      <Section title="Market lifecycle">
        <p>
          Markets run open &rarr; closed (at the posted close time, when all resting orders are
          cancelled and refunded) &rarr; resolved (an admin verdict against the stated resolution
          criteria). At resolution winning shares are automatically redeemed for $1 each — losers
          fund winners and the house carries no risk.
        </p>
      </Section>

      <Section id="api" title="API access">
        <p>
          There is no public trading API in Phase 1 — all order flow goes through the app&rsquo;s
          internal, authenticated RPCs, and API keys are not issued. A public read/trade API is
          planned for a later phase; the internal RPC surface (place, cancel, split, merge, redeem)
          is designed so its semantics can be exposed unchanged when that happens.
        </p>
      </Section>

      <Section id="help" title="Help center">
        <div className="space-y-4">
          <div>
            <div className="font-semibold text-foreground">How do I get play money?</div>
            <p>
              Every account starts with a $1,000 grant, and you can claim a daily reward on the{" "}
              <Link href="/rewards" className="text-primary hover:underline">Rewards</Link> page —
              consecutive-day streaks pay more.
            </p>
          </div>
          <div>
            <div className="font-semibold text-foreground">Is any of this real money?</div>
            <p>
              No. Balances cannot be bought, sold, transferred between users, or withdrawn, and
              never convert to anything of value.
            </p>
          </div>
          <div>
            <div className="font-semibold text-foreground">How are markets resolved?</div>
            <p>
              Each market states its resolution criteria and close time up front. After close, an
              admin resolves it against those criteria and winning shares redeem automatically. The{" "}
              <Link href="/accuracy" className="text-primary hover:underline">Accuracy</Link> page
              tracks how well final prices predicted outcomes.
            </p>
          </div>
          <div>
            <div className="font-semibold text-foreground">Is the exchange audited?</div>
            <p>
              The engine&rsquo;s conservation laws — cash conservation, pair symmetry,
              non-negativity, and trade integrity — are re-verified against the live database every
              10 minutes. See <Link href="/status" className="text-primary hover:underline">Status</Link>.
            </p>
          </div>
        </div>
      </Section>
    </div>
  )
}
