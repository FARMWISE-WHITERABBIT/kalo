"use client"

import { formatCurrency } from "@/lib/currency"
import { useCurrency } from "@/components/currency-provider"
import { cn } from "@/lib/utils"

// Renders a USD ledger value converted to the user's selected display
// currency. Use this anywhere a money amount is shown instead of formatting
// USD directly — keeps the ledger in USD while letting users think in their
// own currency.
export function CurrencyAmount({ usd, className }: { usd: number; className?: string }) {
  const { currency } = useCurrency()
  return <span className={cn("tabular-nums", className)}>{formatCurrency(usd, currency)}</span>
}
