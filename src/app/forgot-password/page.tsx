import { forgotPasswordAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const params = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center bg-white px-5 text-black dark:bg-black dark:text-white">
      <div className="w-full max-w-md">
        <Logo />
        <div className="mt-8 rounded-lg border border-black/10 p-6 shadow-soft dark:border-white/10">
          <h1 className="text-3xl font-black">Reset password</h1>
          <p className="mt-2 text-sm text-black/55 dark:text-white/55">Enter your account email and we will send a secure reset link.</p>
          {params.sent ? <p className="mt-4 rounded-lg border border-brand-blue px-3 py-2 text-sm font-bold text-brand-blue">Reset link sent if the email exists.</p> : null}
          {params.error ? <p className="mt-4 rounded-lg border border-black px-3 py-2 text-sm font-bold dark:border-white">Enter a valid email.</p> : null}
          <form action={forgotPasswordAction} className="mt-6 space-y-4">
            <Input type="email" name="email" placeholder="Email address" required />
            <Button className="w-full" type="submit">Send reset link</Button>
          </form>
        </div>
      </div>
    </main>
  );
}
