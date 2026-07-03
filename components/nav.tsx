import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatCash } from "@/lib/utils"
import { logout } from "@/app/actions/auth"

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

  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Kalo
          </Link>
          {user && (
            <nav className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link href="/" className="hover:text-foreground">
                Markets
              </Link>
              <Link href="/portfolio" className="hover:text-foreground">
                Portfolio
              </Link>
              {profile?.is_admin && (
                <Link href="/admin" className="hover:text-foreground">
                  Admin
                </Link>
              )}
            </nav>
          )}
        </div>

        {user && profile ? (
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="font-mono">
              {formatCash(profile.balance)}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  {profile.display_name}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <form action={logout} className="w-full">
                    <button type="submit" className="w-full text-left">
                      Log out
                    </button>
                  </form>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Log in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/signup">Sign up</Link>
            </Button>
          </div>
        )}
      </div>
    </header>
  )
}
