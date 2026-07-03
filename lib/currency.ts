// Kalo's ledger is USD-only — every balance/price/trade in the database is a
// USD amount. This file is purely a *display* convenience so users can see
// what an amount is worth in their own currency at a glance. Rates below are
// static approximations, not a live feed — do not use them for anything that
// needs to be accurate (they exist to give a sense of scale, not to convert
// real money).

export type CurrencyCode = "USD" | "NGN" | "GHS" | "KES" | "ZAR" | "EGP" | "XOF"

export const CURRENCIES: Record<CurrencyCode, { label: string; symbol: string; perUsd: number }> = {
  USD: { label: "US Dollar", symbol: "$", perUsd: 1 },
  NGN: { label: "Nigerian Naira", symbol: "₦", perUsd: 1550 },
  GHS: { label: "Ghanaian Cedi", symbol: "₵", perUsd: 15.5 },
  KES: { label: "Kenyan Shilling", symbol: "KSh", perUsd: 129 },
  ZAR: { label: "South African Rand", symbol: "R", perUsd: 18.5 },
  EGP: { label: "Egyptian Pound", symbol: "E£", perUsd: 49 },
  XOF: { label: "West African CFA Franc", symbol: "CFA", perUsd: 610 },
}

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[]

export function convertFromUsd(usd: number, code: CurrencyCode): number {
  return usd * CURRENCIES[code].perUsd
}

export function formatCurrency(usd: number, code: CurrencyCode): string {
  const amount = convertFromUsd(usd, code)
  const { symbol } = CURRENCIES[code]
  const decimals = code === "USD" ? 2 : 0
  return `${symbol}${amount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}
