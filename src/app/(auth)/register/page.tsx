import { registerAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string; ref?: string }> }) {
  const params = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center bg-white px-5 text-black dark:bg-black dark:text-white">
      <div className="w-full max-w-md">
        <Logo />
        <div className="mt-8 rounded-lg border border-black/10 p-6 shadow-soft dark:border-white/10">
          <h1 className="text-3xl font-black">Create account</h1>
          <p className="mt-2 text-sm text-black/55 dark:text-white/55">Email verification is required before access. Use at least 10 characters with uppercase, lowercase, number, and symbol.</p>
          {params.error ? (
            <div className="mt-4 rounded-lg border border-black px-3 py-2 text-sm font-semibold text-black dark:border-white dark:text-white">
              Registration failed. Confirm the email and password are valid.
            </div>
          ) : null}
          <form action={registerAction} className="mt-6 space-y-4">
            <input type="hidden" name="referralCode" value={params.ref ?? ""} />
            <Input type="email" name="email" placeholder="Email address" required />
            <Input type="password" name="password" placeholder="Password" minLength={10} required />
            <label className="flex gap-2 text-sm font-semibold text-black/65 dark:text-white/65">
              <input type="checkbox" name="acceptTerms" required />
              I accept the Terms and Conditions.
            </label>
            <label className="flex gap-2 text-sm font-semibold text-black/65 dark:text-white/65">
              <input type="checkbox" name="acceptPrivacy" required />
              I accept the Privacy Policy.
            </label>
            <Button className="w-full" type="submit">
              Register
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
