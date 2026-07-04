"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { ActionState } from "@/app/actions/trading"

// Command-centre control surface for the bot engine. The bot_command RPC is
// SECURITY DEFINER and re-checks is_admin server-side, so this action is just
// a thin transport.
export async function botCommand(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const action = String(formData.get("action") ?? "")
  const valueRaw = formData.get("value")
  const value = valueRaw !== null && valueRaw !== "" ? Number(valueRaw) : undefined

  const supabase = await createClient()
  const { error } = await supabase.rpc("bot_command", {
    p_action: action,
    ...(value !== undefined ? { p_value: value } : {}),
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/admin")
  return { success: true }
}
