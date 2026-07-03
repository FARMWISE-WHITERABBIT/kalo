import type { Database } from "@/lib/types/database"

export type Profile = Database["public"]["Tables"]["profiles"]["Row"]
export type Market = Database["public"]["Tables"]["markets"]["Row"]
export type Position = Database["public"]["Tables"]["positions"]["Row"]
export type Order = Database["public"]["Tables"]["orders"]["Row"]
export type Trade = Database["public"]["Tables"]["trades"]["Row"]
export type OrderBookLevel = Database["public"]["Functions"]["get_order_book"]["Returns"][number]

export type Outcome = "YES" | "NO"
export type OrderSide = "BUY" | "SELL"
