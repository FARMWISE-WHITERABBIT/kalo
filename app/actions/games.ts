"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { ActionState } from "@/app/actions/trading"

// Thin RPC wrappers for the World Cup game engine (migration 0018). All
// validation that matters happens in Postgres; these only shape form input.

export async function createGame(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const homeTeam = String(formData.get("homeTeam") ?? "").trim()
  const awayTeam = String(formData.get("awayTeam") ?? "").trim()
  const homeCode = String(formData.get("homeCode") ?? "").trim().toUpperCase()
  const awayCode = String(formData.get("awayCode") ?? "").trim().toUpperCase()
  const stage = String(formData.get("stage") ?? "").trim()
  const kickoff = String(formData.get("kickoff") ?? "")
  const homePrior = Number(formData.get("homePrior"))
  const drawPrior = Number(formData.get("drawPrior"))

  if (!homeTeam || !awayTeam || homeCode.length !== 3 || awayCode.length !== 3 || !kickoff) {
    return { error: "Teams, 3-letter codes and kickoff are required." }
  }
  if (!Number.isFinite(homePrior) || !Number.isFinite(drawPrior)) {
    return { error: "Priors must be probabilities, e.g. 0.54 and 0.27." }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("create_game", {
    p_home_team: homeTeam,
    p_away_team: awayTeam,
    p_home_code: homeCode,
    p_away_code: awayCode,
    p_stage: stage || "Group stage",
    p_kickoff: new Date(kickoff).toISOString(),
    p_home_prior: homePrior,
    p_draw_prior: drawPrior,
  })
  if (error) return { error: error.message }

  revalidatePath("/admin")
  revalidatePath("/world-cup")
  return { success: true }
}

export async function resolveGame(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const gameId = String(formData.get("gameId") ?? "")
  const homeGoals = Number(formData.get("homeGoals"))
  const awayGoals = Number(formData.get("awayGoals"))

  if (!gameId || !Number.isInteger(homeGoals) || !Number.isInteger(awayGoals)) {
    return { error: "Final score required (whole goals)." }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("resolve_game", {
    p_game_id: gameId,
    p_home_goals: homeGoals,
    p_away_goals: awayGoals,
  })
  if (error) return { error: error.message }

  revalidatePath("/admin")
  revalidatePath("/world-cup")
  revalidatePath(`/world-cup/${gameId}`)
  return { success: true }
}
