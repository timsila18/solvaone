"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[dashboard] Recoverable page error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[65vh] w-full max-w-2xl items-center px-5 py-12">
      <section className="w-full border-y border-black/15 py-10 dark:border-white/15">
        <p className="text-sm font-bold uppercase text-brand-blue">Your payment and draft are safe</p>
        <h1 className="mt-3 text-3xl font-black">This page was interrupted</h1>
        <p className="mt-3 max-w-xl text-black/60 dark:text-white/60">
          SolvaOne could not display this step correctly. Try loading it again, or open My Documents to recover your saved draft and continue without paying again.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={reset}>Try again</Button>
          <Link className="inline-flex h-10 items-center justify-center rounded-lg border border-black/15 px-4 text-sm font-semibold dark:border-white/20" href="/dashboard/documents">
            Open My Documents
          </Link>
          <Link className="inline-flex h-10 items-center justify-center px-2 text-sm font-semibold text-brand-blue" href="/dashboard/support">
            Contact support
          </Link>
        </div>
      </section>
    </main>
  );
}
