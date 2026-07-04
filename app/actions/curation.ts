"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { ActionState } from "@/app/actions/trading"

// Superadmin curation actions. Every RPC re-checks is_admin server-side.

export async function approveProposal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = Number(formData.get("id"))
  if (!Number.isInteger(id)) return { error: "Invalid proposal." }

  const supabase = await createClient()
  const { error } = await supabase.rpc("approve_market_proposal", { p_proposal_id: id })
  if (error) return { error: error.message }

  revalidatePath("/admin")
  revalidatePath("/")
  return { success: true }
}

export async function rejectProposal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = Number(formData.get("id"))
  if (!Number.isInteger(id)) return { error: "Invalid proposal." }

  const supabase = await createClient()
  const { error } = await supabase.rpc("reject_market_proposal", { p_proposal_id: id })
  if (error) return { error: error.message }

  revalidatePath("/admin")
  return { success: true }
}

export async function acceptResolution(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = Number(formData.get("id"))
  if (!Number.isInteger(id)) return { error: "Invalid suggestion." }

  const supabase = await createClient()
  const { error } = await supabase.rpc("accept_resolution_suggestion", { p_suggestion_id: id })
  if (error) return { error: error.message }

  revalidatePath("/admin")
  revalidatePath("/")
  return { success: true }
}

export async function dismissResolution(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = Number(formData.get("id"))
  if (!Number.isInteger(id)) return { error: "Invalid suggestion." }

  const supabase = await createClient()
  const { error } = await supabase.rpc("dismiss_resolution_suggestion", { p_suggestion_id: id })
  if (error) return { error: error.message }

  revalidatePath("/admin")
  return { success: true }
}
