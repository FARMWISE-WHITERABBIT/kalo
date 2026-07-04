import Link from "next/link"

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="font-display text-lg font-extrabold tracking-tight">
              KAL<span className="text-kola">O</span>
            </div>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Play-money event contract exchange. No real money is transacted.
            </p>
          </div>
          <nav className="flex gap-6 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground">
              Markets
            </Link>
            <Link href="/portfolio" className="hover:text-foreground">
              Portfolio
            </Link>
            <Link href="/signup" className="hover:text-foreground">
              Sign up
            </Link>
          </nav>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} Kalo. For entertainment and educational purposes only — not a
          real-money trading platform.
        </p>
      </div>
    </footer>
  )
}
