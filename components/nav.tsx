import Link from "next/link"
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
import { CategoryPills } from "@/components/category-pills"

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
    <header className="sticky top-0 z-10 border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="shrink-0 font-display text-xl font-extrabold tracking-tight">
          KAL<span className="text-kola">O</span>
        </Link>

        <SearchBar />

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {user && profile ? (
            <>
              <CurrencyAmount usd={profile.balance} className="text-sm text-kola font-semibold" />
              <CurrencyPicker />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
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
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">Log in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/signup">Sign up</Link>
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-2">
        <CategoryPills categories={categories} />
      </div>
    </header>
  )
}
