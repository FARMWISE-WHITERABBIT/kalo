"use client"

import { useSyncExternalStore } from "react"

const subscribe = () => () => {}

let cached: number | null = null
function getSnapshot(): number | null {
  if (cached === null) cached = Date.now()
  return cached
}

const getServerSnapshot = (): number | null => null

// Wall-clock timestamp sampled once on the client. Returns null during SSR
// and hydration so server and client markup match; the real time arrives in
// the post-hydration render.
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
