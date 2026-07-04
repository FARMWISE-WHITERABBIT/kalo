import { ScrollText } from "lucide-react"

export const metadata = { title: "Terms of Use — Kalo" }

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center gap-2.5">
        <ScrollText className="size-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Terms of Use</h1>
      </div>

      <div className="mt-6 space-y-6 text-[15px] leading-relaxed text-foreground/80">
        <section>
          <h2 className="font-bold text-foreground">1. Play money only</h2>
          <p>
            Kalo is a play-money prediction exchange for entertainment and educational purposes.
            Balances, shares, and rewards on Kalo have no monetary value. They cannot be purchased,
            sold, exchanged, transferred between users, withdrawn, or converted into money, prizes,
            or anything else of value — now or ever.
          </p>
        </section>
        <section>
          <h2 className="font-bold text-foreground">2. Not gambling, not investment advice</h2>
          <p>
            Because nothing of value is staked or won, Kalo is not a betting, gaming, or investment
            product. Market prices reflect the play-money market&rsquo;s implied probabilities and
            must not be treated as financial, legal, or any other kind of advice.
          </p>
        </section>
        <section>
          <h2 className="font-bold text-foreground">3. Fair play</h2>
          <p>
            One account per person. Wash trading, self-dealing across accounts, exploiting bugs, or
            manipulating markets or the leaderboard may result in balance adjustments, market
            voiding, or account termination. The engine prevents self-matching by design.
          </p>
        </section>
        <section>
          <h2 className="font-bold text-foreground">4. Markets and resolution</h2>
          <p>
            Markets resolve against the criteria stated on the market page. Resolution decisions
            are made by Kalo administrators in good faith and are final. Kalo may close, void, or
            amend markets when criteria turn out to be ambiguous or events are cancelled.
          </p>
        </section>
        <section>
          <h2 className="font-bold text-foreground">5. Service</h2>
          <p>
            Kalo is provided as-is, with no uptime guarantee. Play-money balances may be reset for
            technical or fairness reasons. We may change these terms; continued use after a change
            is acceptance.
          </p>
        </section>
      </div>
    </div>
  )
}
