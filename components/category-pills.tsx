"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"

// Filter chips shown above the "All markets" grid.
export function CategoryPills({ categories }: { categories: string[] }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const active = searchParams.get("category")

  function hrefFor(category: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (category) params.set("category", category)
    else params.delete("category")
    const qs = params.toString()
    return `/${qs ? `?${qs}` : ""}`
  }

  const isHome = pathname === "/"

  return (
    <nav className="no-scrollbar flex items-center gap-2 overflow-x-auto">
      {[null, ...categories].map((c) => (
        <Link
          key={c ?? "all"}
          href={hrefFor(c)}
          className={cn(
            "shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            isHome && active === c
              ? "bg-primary/20 text-primary"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          )}
        >
          {c ?? "All"}
        </Link>
      ))}
    </nav>
  )
}
