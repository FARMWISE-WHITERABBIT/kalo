"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { ActionState } from "@/app/actions/trading"

export async function createMarket(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const question = String(formData.get("question") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const category = String(formData.get("category") ?? "").trim()
  const closeAt = String(formData.get("closeAt") ?? "")

  if (!question) {
    return { error: "Question is required." }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("create_market", {
    p_question: question,
    // the generated RPC types don't reflect that these params are nullable in Postgres
    p_description: (description || null) as string,
    p_category: (category || null) as string,
    p_close_at: (closeAt ? new Date(closeAt).toISOString() : null) as string,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/admin")
  revalidatePath("/")
  return { success: true }
}

export async function resolveMarket(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const marketId = String(formData.get("marketId") ?? "")
  const outcome = String(formData.get("outcome") ?? "")

  if (!marketId || (outcome !== "YES" && outcome !== "NO")) {
    return { error: "Invalid resolution." }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("resolve_market", { p_market_id: marketId, p_outcome: outcome })

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/admin")
  revalidatePath("/")
  revalidatePath(`/market/${marketId}`)
  return { success: true }
}
