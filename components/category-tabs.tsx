"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { TrendingUp, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

// The Polymarket-style topic tab bar that sits under the main nav.
export function CategoryTabs({ categories }: { categories: string[] }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const active = pathname === "/" ? searchParams.get("category") : undefined

  return (
    <div className="border-t border-border/60">
      <div className="relative mx-auto max-w-[1400px] px-4">
        <nav className="no-scrollbar flex items-center gap-6 overflow-x-auto text-sm font-medium">
          <Link
            href="/"
            className={cn(
              "flex shrink-0 items-center gap-1.5 border-b-2 py-2.5 transition-colors",
              active === null
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <TrendingUp className="size-4" />
            Trending
          </Link>

          <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />

          {categories.map((c) => (
            <Link
              key={c}
              href={`/?category=${encodeURIComponent(c)}`}
              className={cn(
                "shrink-0 whitespace-nowrap border-b-2 py-2.5 transition-colors",
                active === c
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {c}
            </Link>
          ))}

          <span className="w-6 shrink-0" />
        </nav>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex w-16 items-center justify-end bg-gradient-to-l from-background via-background/80 to-transparent pr-4">
          <ChevronRight className="size-4 text-muted-foreground" />
        </div>
      </div>
    </div>
  )
}
