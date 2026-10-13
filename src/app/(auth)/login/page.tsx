import { loginAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const errorMessage = params.error === "unavailable"
    ? "Login is temporarily unavailable. Your password may be correct; please try again shortly."
    : params.error === "locked"
      ? "Too many attempts. Please wait 15 minutes before trying again."
      : params.error === "disabled"
        ? "This account is inactive. Please contact support."
        : "The email or password was not accepted. Please try again or reset your password.";
  return (
    <main className="grid min-h-screen place-items-center bg-white px-5 text-black dark:bg-black dark:text-white">
      <div className="w-full max-w-md">
        <Logo />
        <div className="mt-8 rounded-lg border border-black/10 p-6 shadow-soft dark:border-white/10">
          <h1 className="text-3xl font-black">Login</h1>
          <p className="mt-2 text-sm text-black/55 dark:text-white/55">Access your SolvaOne workspace.</p>
          {params.error ? (
            <div className="mt-4 rounded-lg border border-black px-3 py-2 text-sm font-semibold text-black dark:border-white dark:text-white">
              {errorMessage}
            </div>
          ) : null}
          <form action={loginAction} className="mt-6 space-y-4">
            <Input type="email" name="email" placeholder="Email address" required />
            <Input type="password" name="password" placeholder="Password" minLength={8} required />
            <Button className="w-full" type="submit">
              Login
            </Button>
          </form>
          <a className="mt-4 block text-sm font-bold text-brand-blue" href="/forgot-password">
            Forgot password?
          </a>
        </div>
      </div>
    </main>
  );
}
