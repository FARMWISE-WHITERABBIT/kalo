"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { Input } from "@/components/ui/input"

export function SearchBar() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(searchParams.get("q") ?? "")

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set("q", value)
    else params.delete("q")
    router.push(`/?${params.toString()}`)
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-md">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search markets..."
        className="bg-muted border-border"
      />
    </form>
  )
}
