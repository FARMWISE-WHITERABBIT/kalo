"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"

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
    <nav className="flex items-center gap-1 overflow-x-auto">
      {[null, ...categories].map((c) => (
        <Link
          key={c ?? "all"}
          href={hrefFor(c)}
          className={cn(
            "shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors",
            isHome && active === c
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
        >
          {c ?? "All"}
        </Link>
      ))}
    </nav>
  )
}
