import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CreateMarketForm } from "./create-market-form"
import { ResolveMarketButtons } from "./resolve-market-buttons"

export default async function AdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single()

  if (!profile?.is_admin) {
    redirect("/")
  }

  const { data: markets } = await supabase.from("markets").select("*").order("created_at", { ascending: false })
  const openMarkets = (markets ?? []).filter((m) => m.status === "open")
  const resolvedMarkets = (markets ?? []).filter((m) => m.status === "resolved")

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight">Admin</h1>

      <div className="mb-8">
        <CreateMarketForm />
      </div>

      <h2 className="mb-2 font-display text-lg font-semibold tracking-tight">Open markets</h2>
      <Card className="mb-8">
        <CardContent className="divide-y p-0">
          {openMarkets.length === 0 && <p className="p-4 text-sm text-muted-foreground">No open markets.</p>}
          {openMarkets.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-4 p-4">
              <span className="text-sm">{m.question}</span>
              <ResolveMarketButtons marketId={m.id} question={m.question} />
            </div>
          ))}
        </CardContent>
      </Card>

      <h2 className="mb-2 font-display text-lg font-semibold tracking-tight">Resolved markets</h2>
      <Card>
        <CardContent className="divide-y p-0">
          {resolvedMarkets.length === 0 && <p className="p-4 text-sm text-muted-foreground">None yet.</p>}
          {resolvedMarkets.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-4 p-4">
              <span className="text-sm">{m.question}</span>
              <Badge
                variant="outline"
                className={m.resolved_outcome === "YES" ? "border-yes text-yes" : "border-no text-no"}
              >
                {m.resolved_outcome}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
