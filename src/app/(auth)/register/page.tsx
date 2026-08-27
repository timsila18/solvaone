import { registerAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";

const errorMessages: Record<string, string> = {
  email: "Enter a valid email address, for example name@gmail.com.",
  password: "Use at least 8 characters containing an uppercase letter, a lowercase letter, and a number.",
  consent: "Accept both the Terms and Conditions and the Privacy Policy to create your account.",
  existing: "An account may already exist for this email. Log in instead, or reset the password if you have forgotten it.",
  unavailable: "Account creation is temporarily unavailable. Please try again in a moment or contact SolvaOne support.",
  invalid: "Check the highlighted account details and try again."
};

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string; ref?: string }> }) {
  const params = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center bg-white px-5 text-black dark:bg-black dark:text-white">
      <div className="w-full max-w-md">
        <Logo />
        <div className="mt-8 rounded-lg border border-black/10 p-6 shadow-soft dark:border-white/10">
          <h1 className="text-3xl font-black">Create account</h1>
          <p className="mt-2 text-sm text-black/55 dark:text-white/55">Create your account with email and password. Use at least 8 characters with uppercase, lowercase, and a number.</p>
          {params.error ? (
            <div className="mt-4 rounded-lg border border-black px-3 py-2 text-sm font-semibold text-black dark:border-white dark:text-white">
              {errorMessages[params.error] ?? errorMessages.invalid}
              {params.error === "existing" ? (
                <span className="mt-2 block">
                  <a className="font-bold text-brand-blue underline" href="/login">Log in</a>
                  {" or "}
                  <a className="font-bold text-brand-blue underline" href="/forgot-password">reset your password</a>.
                </span>
              ) : null}
            </div>
          ) : null}
          <form action={registerAction} className="mt-6 space-y-4">
            <input type="hidden" name="referralCode" value={params.ref ?? ""} />
            <div>
              <label className="mb-1.5 block text-sm font-semibold" htmlFor="register-email">Email address</label>
              <Input id="register-email" type="email" name="email" placeholder="name@gmail.com" autoComplete="email" required />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold" htmlFor="register-password">Password</label>
              <Input
                id="register-password"
                type="password"
                name="password"
                placeholder="At least 8 characters"
                autoComplete="new-password"
                minLength={8}
                pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{8,}"
                title="Use at least 8 characters with an uppercase letter, a lowercase letter, and a number."
                aria-describedby="register-password-help"
                required
              />
              <p id="register-password-help" className="mt-1.5 text-xs text-black/55 dark:text-white/55">
                Include uppercase, lowercase, and a number. No email verification is required.
              </p>
            </div>
            <label className="flex gap-2 text-sm font-semibold text-black/65 dark:text-white/65">
              <input type="checkbox" name="acceptTerms" required />
              I accept the Terms and Conditions.
            </label>
            <label className="flex gap-2 text-sm font-semibold text-black/65 dark:text-white/65">
              <input type="checkbox" name="acceptPrivacy" required />
              I accept the Privacy Policy.
            </label>
            <Button className="w-full" type="submit">
              Create Account &amp; Continue
            </Button>
          </form>
          <p className="mt-5 text-center text-sm text-black/60 dark:text-white/60">
            Already registered? <a className="font-bold text-brand-blue" href="/login">Log in</a>
          </p>
        </div>
      </div>
    </main>
  );
}
