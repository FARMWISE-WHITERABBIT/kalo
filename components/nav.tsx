import Link from "next/link"
import { Info, Menu } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { logout } from "@/app/actions/auth"
import { CurrencyAmount } from "@/components/currency-amount"
import { CurrencyPicker } from "@/components/currency-picker"
import { SearchBar } from "@/components/search-bar"
import { CategoryTabs } from "@/components/category-tabs"
import { Logo } from "@/components/logo"

export async function Nav() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let profile: { display_name: string; balance: number; is_admin: boolean } | null = null
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("display_name, balance, is_admin")
      .eq("id", user.id)
      .single()
    profile = data
  }

  const { data: marketRows } = await supabase.from("markets").select("category").eq("status", "open")
  const categories = Array.from(
    new Set((marketRows ?? []).map((m) => m.category).filter((c): c is string => !!c))
  ).sort()

  return (
    <header className="sticky top-0 z-10 border-b border-border/60 bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-6 px-4">
        <Logo />

        <SearchBar />

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Link
            href="/#how-it-works"
            className="mr-2 hidden items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 lg:flex"
          >
            <Info className="size-4" />
            How it works
          </Link>

          {user && profile ? (
            <>
              <Link href="/portfolio" className="mr-1 hidden text-right sm:block">
                <div className="text-sm font-semibold leading-tight text-yes">
                  <CurrencyAmount usd={profile.balance} className="text-sm" />
                </div>
                <div className="text-[11px] leading-tight text-muted-foreground">Cash</div>
              </Link>
              <CurrencyPicker />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="font-medium">
                    {profile.display_name}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href="/portfolio">Portfolio</Link>
                  </DropdownMenuItem>
                  {profile.is_admin && (
                    <DropdownMenuItem asChild>
                      <Link href="/admin">Admin</Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <form action={logout} className="w-full">
                      <button type="submit" className="w-full text-left">
                        Log out
                      </button>
                    </form>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <CurrencyPicker />
              <Button
                variant="ghost"
                size="sm"
                className="font-semibold text-primary hover:text-primary"
                asChild
              >
                <Link href="/login">Log In</Link>
              </Button>
              <Button
                size="sm"
                className="h-9 rounded-lg bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary/90"
                asChild
              >
                <Link href="/signup">Sign Up</Link>
              </Button>
            </>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground" aria-label="Menu">
                <Menu className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link href="/">Markets</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/portfolio">Portfolio</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/#how-it-works">How it works</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/admin">Create a market</Link>
              </DropdownMenuItem>
              {!user && (
                <>
                  <DropdownMenuItem asChild>
                    <Link href="/login">Log In</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/signup">Sign Up</Link>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <CategoryTabs categories={categories} />
    </header>
  )
}
