import type { Metadata } from "next";
import { PublicShell } from "@/components/marketing/public-shell";
import { CheckoutCTA, TrustBadge } from "@/components/marketing/sections";
import { site } from "@/lib/marketing";

export const metadata: Metadata = {
  title: "About",
  description: "SolvaOne is a premium document generation platform by Solva Business Group.",
  alternates: { canonical: "/about" }
};

export default function AboutPage() {
  return (
    <PublicShell>
      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:px-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <h1 className="text-5xl font-black leading-[1.04] md:text-6xl">Built for serious applications and serious businesses.</h1>
          <p className="mt-6 text-lg font-semibold leading-8 text-black/65 dark:text-white/65">
            SolvaOne helps professionals, founders, and SMEs create premium documents faster without sacrificing structure, credibility, or editability.
          </p>
        </div>
        <div className="rounded-lg border border-black/10 p-6 dark:border-white/10">
          <h2 className="text-2xl font-black">{site.parent}</h2>
          <p className="mt-4 text-sm leading-6 text-black/58 dark:text-white/58">
            SolvaOne is the document intelligence platform under Solva Business Group, focused on career and business documents for Kenya and East Africa.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <TrustBadge label="Create" />
            <TrustBadge label="Apply" />
            <TrustBadge label="Grow" />
            <TrustBadge label="Solva Intelligence" />
          </div>
        </div>
      </section>
      <CheckoutCTA title="Create a document with the right structure from the start." />
    </PublicShell>
  );
}
