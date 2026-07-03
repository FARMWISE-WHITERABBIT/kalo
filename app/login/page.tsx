import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LoginForm } from "./login-form"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ confirm?: string }>
}) {
  const { confirm } = await searchParams

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-display text-lg">
            Log in to KAL<span className="text-kola">O</span>
          </CardTitle>
          <CardDescription>
            {confirm
              ? "Check your email to confirm your account, then log in."
              : "Trade on play-money prediction markets."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  )
}
