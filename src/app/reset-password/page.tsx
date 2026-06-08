import { resetPasswordAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center bg-white px-5 text-black dark:bg-black dark:text-white">
      <div className="w-full max-w-md">
        <Logo />
        <div className="mt-8 rounded-lg border border-black/10 p-6 shadow-soft dark:border-white/10">
          <h1 className="text-3xl font-black">Choose a new password</h1>
          <p className="mt-2 text-sm text-black/55 dark:text-white/55">Use at least 10 characters with uppercase, lowercase, number, and symbol.</p>
          {params.error ? <p className="mt-4 rounded-lg border border-black px-3 py-2 text-sm font-bold dark:border-white">The reset link is invalid or the password is too weak.</p> : null}
          <form action={resetPasswordAction} className="mt-6 space-y-4">
            <Input type="password" name="password" placeholder="New password" minLength={10} required />
            <Button className="w-full" type="submit">Update password</Button>
          </form>
        </div>
      </div>
    </main>
  );
}
