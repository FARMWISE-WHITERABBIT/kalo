import Link from "next/link"
import { Mail, Globe, ChevronDown } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { LogoMark } from "@/components/logo"

function FooterMarketLink({ label, href }: { label: string; href: string }) {
  return (
    <Link href={href} className="block">
      <div className="text-[15px] font-medium text-foreground hover:text-primary">{label}</div>
      <div className="text-sm text-muted-foreground/70">Predictions &amp; odds</div>
    </Link>
  )
}

export async function Footer() {
  const supabase = await createClient()
  const { data: marketRows } = await supabase
    .from("markets")
    .select("category")
    .eq("status", "open")
  const categories = Array.from(
    new Set((marketRows ?? []).map((m) => m.category).filter((c): c is string => !!c))
  ).sort()

  const columns: string[][] = [[], [], []]
  categories.slice(0, 15).forEach((c, i) => columns[i % 3].push(c))

  return (
    <footer className="mt-16 border-t border-border/60">
      <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-16">
        <div className="flex items-center gap-2.5">
          <LogoMark className="size-8" />
          <span className="text-3xl font-bold tracking-tight">Kalo</span>
        </div>
        <p className="mt-3 text-lg text-foreground/90">
          The Play-Money Prediction Market&trade;
        </p>

        <div className="mt-14 grid gap-10 lg:grid-cols-[1fr_1fr_1fr_auto_auto]">
          <div className="lg:col-span-3">
            <div className="mb-6 text-[15px] text-muted-foreground">
              Markets by category and topics
            </div>
            <div className="grid gap-x-10 gap-y-6 sm:grid-cols-3">
              {columns.map((col, i) => (
                <div key={i} className="space-y-6">
                  {col.map((c) => (
                    <FooterMarketLink key={c} label={c} href={`/?category=${encodeURIComponent(c)}`} />
                  ))}
                </div>
              ))}
              {categories.length === 0 && (
                <FooterMarketLink label="All markets" href="/" />
              )}
            </div>
            {categories.length > 0 && (
              <Link
                href="/"
                className="mt-8 inline-flex items-center gap-1 text-[15px] text-muted-foreground hover:text-foreground"
              >
                View more <ChevronDown className="size-4" />
              </Link>
            )}
          </div>

          <div className="min-w-40">
            <div className="mb-6 text-[15px] text-muted-foreground">Support &amp; Social</div>
            <ul className="space-y-5 text-[15px] font-medium">
              <li><Link href="/#how-it-works" className="hover:text-primary">Learn</Link></li>
              <li><Link href="/portfolio" className="hover:text-primary">Portfolio</Link></li>
              <li><Link href="/login" className="hover:text-primary">Log In</Link></li>
              <li><Link href="/signup" className="hover:text-primary">Sign Up</Link></li>
              <li><a href="mailto:hello@kalo.example" className="hover:text-primary">Contact us</a></li>
            </ul>
          </div>

          <div className="min-w-40">
            <div className="mb-6 text-[15px] text-muted-foreground">Kalo</div>
            <ul className="space-y-5 text-[15px] font-medium">
              <li><Link href="/" className="hover:text-primary">Markets</Link></li>
              <li><Link href="/portfolio" className="hover:text-primary">Leaderboard</Link></li>
              <li><Link href="/admin" className="hover:text-primary">Create a market</Link></li>
              <li><Link href="/#how-it-works" className="hover:text-primary">How it works</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-16 flex flex-wrap items-center gap-x-6 gap-y-4 border-t border-border/60 pt-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-4">
            <a href="mailto:hello@kalo.example" aria-label="Email" className="hover:text-foreground">
              <Mail className="size-4.5" />
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-foreground/80">Kalo &copy; {new Date().getFullYear()}</span>
            <span aria-hidden="true">&middot;</span>
            <Link href="/#how-it-works" className="hover:text-foreground">How it works</Link>
            <span aria-hidden="true">&middot;</span>
            <Link href="/" className="hover:text-foreground">Markets</Link>
            <span aria-hidden="true">&middot;</span>
            <Link href="/portfolio" className="hover:text-foreground">Portfolio</Link>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Globe className="size-4" />
            English
            <ChevronDown className="size-3.5" />
          </div>
        </div>

        <p className="mt-6 max-w-5xl text-sm leading-relaxed text-muted-foreground/80">
          Kalo is a play-money event contract exchange for entertainment and educational purposes
          only. No real money is deposited, traded, or paid out. Prices reflect the play-money
          market&rsquo;s implied probability and are not financial advice.
        </p>
      </div>
    </footer>
  )
}
