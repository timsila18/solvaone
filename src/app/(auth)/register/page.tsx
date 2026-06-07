import { registerAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center bg-white px-5 text-black dark:bg-black dark:text-white">
      <div className="w-full max-w-md">
        <Logo />
        <div className="mt-8 rounded-lg border border-black/10 p-6 shadow-soft dark:border-white/10">
          <h1 className="text-3xl font-black">Create account</h1>
          <p className="mt-2 text-sm text-black/55 dark:text-white/55">Email verification is required before access.</p>
          {params.error ? (
            <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:bg-red-500/10 dark:text-red-200">
              Registration failed. Confirm the email and password are valid.
            </div>
          ) : null}
          <form action={registerAction} className="mt-6 space-y-4">
            <Input type="email" name="email" placeholder="Email address" required />
            <Input type="password" name="password" placeholder="Password" minLength={8} required />
            <Button className="w-full" type="submit">
              Register
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
