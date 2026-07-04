"use client"

import { useSyncExternalStore } from "react"
import { Moon } from "lucide-react"
import { cn } from "@/lib/utils"

function subscribe(cb: () => void) {
  window.addEventListener("kalo-theme-change", cb)
  return () => window.removeEventListener("kalo-theme-change", cb)
}

const isDarkSnapshot = () => document.documentElement.classList.contains("dark")
const serverSnapshot = () => true // SSR renders the dark default

// Dark-mode row for the hamburger menu: label + switch, Polymarket-style.
export function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, isDarkSnapshot, serverSnapshot)

  function toggle() {
    const next = !document.documentElement.classList.contains("dark")
    document.documentElement.classList.toggle("dark", next)
    try {
      localStorage.setItem("kalo-theme", next ? "dark" : "light")
    } catch {
      // storage unavailable — theme still toggles for this page view
    }
    window.dispatchEvent(new Event("kalo-theme-change"))
  }

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={isDark}
      className="flex w-full items-center gap-2 text-sm"
    >
      <Moon className="size-4 text-primary" />
      <span className="flex-1 text-left">Dark mode</span>
      <span
        aria-hidden="true"
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors",
          isDark ? "bg-primary" : "bg-input"
        )}
      >
        <span
          className={cn(
            "absolute left-0 top-0.5 size-4 rounded-full bg-white transition-transform",
            isDark ? "translate-x-[18px]" : "translate-x-0.5"
          )}
        />
      </span>
    </button>
  )
}
