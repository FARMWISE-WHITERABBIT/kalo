"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { ActionState } from "@/app/actions/trading"

export async function claimFaucet(): Promise<ActionState> {
  const supabase = await createClient()
  const { error } = await supabase.rpc("claim_faucet")

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/rewards")
  revalidatePath("/portfolio")
  return { success: true }
}
