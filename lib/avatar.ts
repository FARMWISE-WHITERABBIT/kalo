// Deterministic placeholder "thumbnail" color for a market card, since we
// don't have an image upload pipeline — a stable hash of the category name
// picks a hue so cards read as visually distinct at a glance.
export function categoryColor(category: string | null): string {
  const key = category ?? "General"
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i)
    hash |= 0
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 65%, 45%)`
}

export function categoryInitial(category: string | null): string {
  return (category ?? "K").trim().charAt(0).toUpperCase()
}
