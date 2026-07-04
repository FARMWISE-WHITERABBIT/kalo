"use client"

import Link from "next/link"
import { ChevronRight, CodeXml, Gift, Globe, Menu, Trophy } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ThemeToggle } from "@/components/theme-toggle"

// The Polymarket-style hamburger menu: quick links, theme toggle, and the
// secondary/legal pages.
export function NavMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground" aria-label="Menu">
          <Menu className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <Link href="/leaderboard" className="flex items-center gap-2">
            <Trophy className="size-4 text-chart-2" />
            Leaderboard
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/rewards" className="flex items-center gap-2">
            <Gift className="size-4 text-yes" />
            Rewards
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/docs#api" className="flex items-center gap-2">
            <CodeXml className="size-4 text-no" />
            APIs
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
          <ThemeToggle />
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/accuracy" className="text-muted-foreground">Accuracy</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/status" className="text-muted-foreground">Status</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/docs" className="text-muted-foreground">Documentation</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/docs#help" className="text-muted-foreground">Help Center</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/terms" className="text-muted-foreground">Terms of Use</Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem className="text-muted-foreground" onSelect={(e) => e.preventDefault()}>
          <Globe className="size-4" />
          <span className="flex-1">English</span>
          <ChevronRight className="size-4" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
