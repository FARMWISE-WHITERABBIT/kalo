import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCash(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatPercent(price: number) {
  return `${Math.round(price * 100)}%`
}

export function formatShares(shares: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(shares)
}

export function formatTradeKind(kind: string | null) {
  switch (kind) {
    case "transfer_yes":
      return "transfer YES"
    case "transfer_no":
      return "transfer NO"
    case "mint":
      return "mint"
    case "merge":
      return "merge"
    default:
      return "trade"
  }
}
