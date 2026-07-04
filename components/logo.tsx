import Link from "next/link"
import { cn } from "@/lib/utils"

// Kalo logomark — an angled open-cube mark in the spirit of exchange logos.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinejoin="round"
      strokeLinecap="round"
      className={cn("size-7", className)}
      aria-hidden="true"
    >
      <path d="M19 3.5 5 7v10l14 3.5V3.5Z" />
      <path d="M19 3.5 12 8.75v6.5L19 20.5" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex shrink-0 items-center gap-2 text-foreground", className)}>
      <LogoMark />
      <span className="text-[22px] font-bold tracking-tight">Kalo</span>
    </Link>
  )
}
