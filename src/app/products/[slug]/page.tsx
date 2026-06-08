import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { PublicShell } from "@/components/marketing/public-shell";
import { CheckoutCTA, DocumentPreviewCard, FAQAccordion, ProgressSteps } from "@/components/marketing/sections";
import { ButtonLink } from "@/components/ui/button";
import { productMetadata, productPages } from "@/lib/marketing";
import { pricingProducts } from "@/lib/pricing";
import { formatKes } from "@/lib/utils";

export function generateStaticParams() {
  return productPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = productPages.find((item) => item.slug === slug);
  if (!page) return {};
  return productMetadata(page);
}

export default async function ProductLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = productPages.find((item) => item.slug === slug);
  if (!page) notFound();
  const product = pricingProducts[page.key];

  return (
    <PublicShell>
      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div>
          <h1 className="text-5xl font-black leading-[1.04] md:text-6xl">{page.headline}</h1>
          <p className="mt-6 text-lg font-semibold leading-8 text-black/65 dark:text-white/65">{page.solution}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href={`/dashboard/projects/new?product=${page.key}`}>Create My Document</ButtonLink>
            <span className="text-lg font-black">{formatKes(product.price)}</span>
          </div>
        </div>
        <DocumentPreviewCard product={page.key} featured />
      </section>
      <section className="border-y border-black/10 dark:border-white/10">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 md:px-6 lg:grid-cols-3">
          <InfoBlock title="The problem" text={page.problem} />
          <InfoBlock title="The solution" text={page.solution} />
          <InfoBlock title="What you receive" items={page.receives} />
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-14 md:px-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h2 className="text-4xl font-black">Built to convert your details into a document worth paying for.</h2>
          <p className="mt-4 text-sm leading-6 text-black/58 dark:text-white/58">Solva Intelligence focuses on structure, tone, completeness, and practical professional outcomes.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {page.benefits.map((benefit) => (
            <div key={benefit} className="rounded-lg border border-black/10 p-5 dark:border-white/10">
              <CheckCircle2 className="h-5 w-5 text-brand-blue" />
              <p className="mt-4 text-sm font-black">{benefit}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-14 md:px-6">
        <h2 className="text-4xl font-black">How it works</h2>
        <div className="mt-8"><ProgressSteps /></div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-14 md:px-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h2 className="text-4xl font-black">FAQ</h2>
          <p className="mt-4 text-sm leading-6 text-black/58 dark:text-white/58">Clear answers before you start checkout.</p>
        </div>
        <FAQAccordion items={page.faqs} />
      </section>
      <CheckoutCTA title={`Start your ${product.productName.toLowerCase()} today.`} product={page.key} />
    </PublicShell>
  );
}

function InfoBlock({ title, text, items }: { title: string; text?: string; items?: string[] }) {
  return (
    <div>
      <h2 className="text-sm font-black uppercase text-brand-blue">{title}</h2>
      {text ? <p className="mt-3 text-sm leading-6 text-black/62 dark:text-white/62">{text}</p> : null}
      {items ? (
        <ul className="mt-3 space-y-2 text-sm leading-6 text-black/62 dark:text-white/62">
          {items.map((item) => <li key={item}>- {item}</li>)}
        </ul>
      ) : null}
    </div>
  );
}
