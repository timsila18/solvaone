import { MailCheck } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

export default function VerifyPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-white px-5 text-black dark:bg-black dark:text-white">
      <div className="w-full max-w-md rounded-lg border border-black/10 p-8 text-center shadow-soft dark:border-white/10">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <MailCheck className="mx-auto h-12 w-12 text-brand-blue" />
        <h1 className="mt-5 text-3xl font-black">Verify your email</h1>
        <p className="mt-3 text-sm leading-6 text-black/60 dark:text-white/60">
          Check your inbox and follow the Supabase verification link to activate your SolvaOne account.
        </p>
        <ButtonLink className="mt-6" href="/login">
          Back to login
        </ButtonLink>
      </div>
    </main>
  );
}
