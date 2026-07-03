import Link from "next/link"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatCash, formatPercent, formatShares } from "@/lib/utils"
import { CancelOrderButton } from "./cancel-order-button"

export default async function PortfolioPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const [{ data: profile }, { data: positions }, { data: orders }] = await Promise.all([
    supabase.from("profiles").select("balance, display_name").eq("id", user.id).single(),
    supabase
      .from("positions")
      .select("*, markets(question, status, resolved_outcome)")
      .eq("user_id", user.id)
      .gt("shares", 0),
    supabase
      .from("orders")
      .select("*, markets(question)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ])

  const openOrders = (orders ?? []).filter((o) => o.status === "open" || o.status === "partial")
  const pastOrders = (orders ?? []).filter((o) => o.status === "filled" || o.status === "cancelled")

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Portfolio</h1>

      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold">{formatCash(profile?.balance ?? 0)}</p>
        </CardContent>
      </Card>

      <h2 className="mb-2 text-lg font-semibold tracking-tight">Positions</h2>
      <Card className="mb-6">
        <CardContent className="p-0">
          {(positions ?? []).length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No open positions yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Market</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead className="text-right">Shares</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(positions ?? []).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/market/${p.market_id}`} className="hover:underline">
                        {p.markets?.question ?? "Market"}
                      </Link>
                      {p.markets?.status === "resolved" && (
                        <Badge variant="outline" className="ml-2">
                          Resolved {p.markets.resolved_outcome}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{p.outcome}</TableCell>
                    <TableCell className="text-right">{formatShares(p.shares)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <h2 className="mb-2 text-lg font-semibold tracking-tight">Open orders</h2>
      <Card className="mb-6">
        <CardContent className="p-0">
          {openOrders.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No open orders.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Market</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead className="text-right">Filled / Size</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {openOrders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link href={`/market/${o.market_id}`} className="hover:underline">
                        {o.markets?.question ?? "Market"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {o.side} {o.outcome}
                    </TableCell>
                    <TableCell>{formatPercent(o.price)}</TableCell>
                    <TableCell className="text-right">
                      {formatShares(o.filled_size)} / {formatShares(o.size)}
                    </TableCell>
                    <TableCell className="text-right">
                      <CancelOrderButton orderId={o.id} marketId={o.market_id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <h2 className="mb-2 text-lg font-semibold tracking-tight">Order history</h2>
      <Card>
        <CardContent className="p-0">
          {pastOrders.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No past orders.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Market</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead className="text-right">Filled / Size</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pastOrders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link href={`/market/${o.market_id}`} className="hover:underline">
                        {o.markets?.question ?? "Market"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {o.side} {o.outcome}
                    </TableCell>
                    <TableCell>{formatPercent(o.price)}</TableCell>
                    <TableCell className="text-right">
                      {formatShares(o.filled_size)} / {formatShares(o.size)}
                    </TableCell>
                    <TableCell className="text-right capitalize">{o.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
