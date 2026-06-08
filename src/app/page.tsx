import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { PublicShell } from "@/components/marketing/public-shell";
import { CheckoutCTA, DocumentPreviewCard, FAQAccordion, Hero, PricingCard, ProductCard, ProgressSteps, TestimonialCard } from "@/components/marketing/sections";
import { ButtonLink } from "@/components/ui/button";
import { faqs, productPages, site } from "@/lib/marketing";

export const metadata: Metadata = {
  title: "SolvaOne | Create professional documents in minutes",
  description: "CVs, cover letters, company profiles and business plans powered by Solva Intelligence for Kenya.",
  alternates: { canonical: "/" },
  keywords: ["CV builder Kenya", "CV revamp Kenya", "Professional CV Kenya", "Cover letter Kenya", "Company profile Kenya", "Business plan Kenya"]
};

export default function HomePage() {
  return (
    <PublicShell>
      <Hero
        title="Create professional documents in minutes."
        subtitle="CVs, cover letters, company profiles and business plans powered by Solva Intelligence."
      />
      <section className="border-y border-black/10 dark:border-white/10">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-10 md:grid-cols-5 md:px-6">
          {productPages.map((page) => <ProductCard key={page.key} productKey={page.key} />)}
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-14 md:px-6">
        <div className="max-w-2xl">
          <h2 className="text-4xl font-black">How it works</h2>
          <p className="mt-3 text-sm leading-6 text-black/58 dark:text-white/58">A focused flow from draft to paid, editable, downloadable document.</p>
        </div>
        <div className="mt-8">
          <ProgressSteps />
        </div>
      </section>
      <section className="bg-black text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <h2 className="text-4xl font-black">Why SolvaOne</h2>
            <div className="mt-6 space-y-4">
              {["Kenyan professional tone", "M-Pesa-first checkout", "Editable documents with version history", "PDF, DOCX, and receipt downloads"].map((item) => (
                <div key={item} className="flex gap-3 text-sm font-semibold text-white/72">
                  <CheckCircle2 className="h-5 w-5 text-brand-blue" />
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <DocumentPreviewCard product="company_profile" />
            <DocumentPreviewCard product="business_plan" />
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-14 md:px-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h2 className="text-4xl font-black">Pricing that is clear before checkout.</h2>
          <p className="mt-4 text-sm leading-6 text-black/58 dark:text-white/58">No hidden platform fees. You see the product price before M-Pesa STK Push starts.</p>
          <ButtonLink className="mt-6" href="/pricing" variant="secondary">View all pricing <ArrowRight className="h-4 w-4" /></ButtonLink>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <PricingCard productId="cv_builder" />
          <PricingCard productId="cv_cover_bundle" highlight />
          <PricingCard productId="business_plan" />
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-14 md:px-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h2 className="text-4xl font-black">Testimonials</h2>
            <p className="mt-3 text-sm leading-6 text-black/58 dark:text-white/58">Displayed only after customer approval and verification.</p>
          </div>
          <Link href="/contact" className="text-sm font-black text-brand-blue">Share feedback</Link>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <TestimonialCard />
          <TestimonialCard />
          <TestimonialCard />
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-14 md:px-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h2 className="text-4xl font-black">Questions before you pay?</h2>
          <p className="mt-4 text-sm leading-6 text-black/58 dark:text-white/58">Start with the common questions, then contact support if you need help.</p>
        </div>
        <FAQAccordion items={faqs.slice(0, 4)} />
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: site.name,
            url: site.url,
            parentOrganization: site.parent
          })
        }}
      />
      <CheckoutCTA title="Create, apply, and grow with a document you can trust." product="cv_builder" />
    </PublicShell>
  );
}
