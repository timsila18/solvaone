"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[admin] Dashboard load failed", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[65vh] w-full max-w-2xl items-center px-5 py-12">
      <section className="w-full border-y border-black/15 py-10 dark:border-white/15">
        <h1 className="text-3xl font-black">Admin reports are temporarily unavailable</h1>
        <p className="mt-3 text-black/60 dark:text-white/60">
          Your account is still signed in. Reporting could not finish loading, but you can continue working in Job Desk.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={reset}>Retry reports</Button>
          <Link className="inline-flex h-10 items-center justify-center rounded-lg border border-black/15 px-4 text-sm font-semibold dark:border-white/20" href="/dashboard/admin/job-desk">
            Open Job Desk
          </Link>
        </div>
      </section>
    </main>
  );
}
