"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export type ActionState = { error?: string; success?: boolean } | null

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function placeOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const marketId = String(formData.get("marketId") ?? "")
  const outcome = String(formData.get("outcome") ?? "")
  const side = String(formData.get("side") ?? "")
  const price = Number(formData.get("price"))
  const size = Number(formData.get("size"))
  const ioc = formData.get("ioc") === "true"
  const fok = formData.get("fok") === "true"
  const expiresAtRaw = String(formData.get("expiresAt") ?? "")
  const clientOrderId = String(formData.get("clientOrderId") ?? "")

  if (!marketId || !outcome || !side || !Number.isFinite(price) || !Number.isFinite(size)) {
    return { error: "Invalid order." }
  }

  let expiresAt: string | undefined
  if (expiresAtRaw) {
    const parsed = new Date(expiresAtRaw)
    if (Number.isNaN(parsed.getTime())) {
      return { error: "Invalid expiry." }
    }
    expiresAt = parsed.toISOString()
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("place_order", {
    p_market_id: marketId,
    p_outcome: outcome,
    p_side: side,
    p_price: price,
    p_size: size,
    p_ioc: ioc,
    p_fok: fok,
    ...(expiresAt ? { p_expires_at: expiresAt } : {}),
    // idempotency key (P0-7): retries and double-clicks reuse the same id,
    // so the engine returns the original order instead of double-placing
    ...(UUID_RE.test(clientOrderId) ? { p_client_order_id: clientOrderId } : {}),
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/market/${marketId}`)
  revalidatePath("/portfolio")
  return { success: true }
}

export async function cancelOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const orderId = String(formData.get("orderId") ?? "")
  const marketId = String(formData.get("marketId") ?? "")

  const supabase = await createClient()
  const { error } = await supabase.rpc("cancel_order", { p_order_id: orderId })

  if (error) {
    return { error: error.message }
  }

  if (marketId) revalidatePath(`/market/${marketId}`)
  revalidatePath("/portfolio")
  return { success: true }
}

export async function splitShares(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const marketId = String(formData.get("marketId") ?? "")
  const amount = Number(formData.get("amount"))

  if (!marketId || !Number.isFinite(amount) || amount <= 0) {
    return { error: "Enter a positive amount." }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("split_shares", { p_market_id: marketId, p_amount: amount })

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/market/${marketId}`)
  revalidatePath("/portfolio")
  return { success: true }
}

export async function mergeShares(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const marketId = String(formData.get("marketId") ?? "")
  const shares = Number(formData.get("shares"))

  if (!marketId || !Number.isFinite(shares) || shares <= 0) {
    return { error: "Enter a positive amount." }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("merge_shares", { p_market_id: marketId, p_shares: shares })

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/market/${marketId}`)
  revalidatePath("/portfolio")
  return { success: true }
}

export async function redeemMarket(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const marketId = String(formData.get("marketId") ?? "")

  const supabase = await createClient()
  const { error } = await supabase.rpc("redeem_market", { p_market_id: marketId })

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/market/${marketId}`)
  revalidatePath("/portfolio")
  return { success: true }
}
