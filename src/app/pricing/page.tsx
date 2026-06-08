import type { Metadata } from "next";
import { PublicShell } from "@/components/marketing/public-shell";
import { CheckoutCTA, PricingCard } from "@/components/marketing/sections";
import { pricingProducts } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Pricing",
  description: "SolvaOne pricing for CVs, cover letters, company profiles, and business plans in Kenya.",
  alternates: { canonical: "/pricing" },
  keywords: ["CV builder Kenya pricing", "CV revamp Kenya", "Business plan Kenya", "Company profile Kenya"]
};

export default function PricingPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-7xl px-4 py-14 md:px-6">
        <h1 className="max-w-3xl text-5xl font-black leading-[1.04] md:text-6xl">Clear pricing before you pay.</h1>
        <p className="mt-5 max-w-2xl text-lg font-semibold leading-8 text-black/65 dark:text-white/65">
          Choose a document, pay through M-Pesa, generate with Solva Intelligence, edit, and download PDF or DOCX.
        </p>
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Object.values(pricingProducts).map((product) => (
            <PricingCard key={product.productId} productId={product.productId} highlight={product.productId === "cv_cover_bundle"} />
          ))}
        </div>
      </section>
      <CheckoutCTA title="Start with the document you need most." />
    </PublicShell>
  );
}
