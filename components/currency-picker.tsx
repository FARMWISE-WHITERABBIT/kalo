"use client"

import { CURRENCIES, CURRENCY_CODES, type CurrencyCode } from "@/lib/currency"
import { useCurrency } from "@/components/currency-provider"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function CurrencyPicker() {
  const { currency, setCurrency } = useCurrency()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="font-mono text-xs">
          {currency}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {CURRENCY_CODES.map((code) => (
          <DropdownMenuItem key={code} onClick={() => setCurrency(code as CurrencyCode)}>
            <span className="font-mono w-12">{code}</span>
            <span className="text-muted-foreground">{CURRENCIES[code].label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
