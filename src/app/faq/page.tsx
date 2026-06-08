import type { Metadata } from "next";
import { PublicShell } from "@/components/marketing/public-shell";
import { CheckoutCTA, FAQAccordion } from "@/components/marketing/sections";
import { faqs } from "@/lib/marketing";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers about SolvaOne payments, AI generation, editing, and downloads.",
  alternates: { canonical: "/faq" }
};

export default function FAQPage() {
  return (
    <PublicShell>
      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-14 md:px-6 lg:grid-cols-[0.75fr_1.25fr]">
        <div>
          <h1 className="text-5xl font-black leading-[1.04] md:text-6xl">Frequently asked questions.</h1>
          <p className="mt-5 text-sm leading-6 text-black/58 dark:text-white/58">Clear answers before you create, pay, generate, or download.</p>
        </div>
        <FAQAccordion items={faqs} />
      </section>
      <CheckoutCTA title="Still ready to begin?" />
    </PublicShell>
  );
}
