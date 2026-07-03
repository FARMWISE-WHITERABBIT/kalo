"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { type CurrencyCode } from "@/lib/currency"

const STORAGE_KEY = "kalo-display-currency"

const CurrencyContext = createContext<{
  currency: CurrencyCode
  setCurrency: (c: CurrencyCode) => void
}>({ currency: "USD", setCurrency: () => {} })

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyCode>("USD")

  useEffect(() => {
    // Reads a client-only preference after mount; the one extra render this
    // causes is the intended hydration-safe way to apply it (the server has
    // no access to localStorage, so it can't be in the initial render).
    const stored = localStorage.getItem(STORAGE_KEY) as CurrencyCode | null
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setCurrencyState(stored)
  }, [])

  function setCurrency(c: CurrencyCode) {
    setCurrencyState(c)
    localStorage.setItem(STORAGE_KEY, c)
  }

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  return useContext(CurrencyContext)
}
