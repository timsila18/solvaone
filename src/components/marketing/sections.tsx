import { ArrowRight, CheckCircle2, FileText, ShieldCheck, Sparkles, Star, TrendingUp } from "lucide-react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { faqs, productPages, productUrl } from "@/lib/marketing";
import { pricingProducts, type ProductId } from "@/lib/pricing";
import type { ProductKey } from "@/lib/types";
import { cn, formatKes } from "@/lib/utils";

export function Hero({
  title,
  subtitle,
  primaryHref = "/dashboard/projects/new?product=cv_builder",
  secondaryHref = "/pricing"
}: {
  title: string;
  subtitle: string;
  primaryHref?: string;
  secondaryHref?: string;
}) {
  return (
    <section className="mx-auto grid max-w-7xl gap-10 px-4 pb-14 pt-12 md:px-6 lg:grid-cols-[1fr_0.9fr] lg:items-center lg:pb-20 lg:pt-18">
      <div>
        <h1 className="max-w-4xl text-5xl font-black leading-[1.03] md:text-7xl">{title}</h1>
        <p className="mt-6 max-w-2xl text-lg font-semibold leading-8 text-black/65 dark:text-white/65">{subtitle}</p>
        <p className="mt-4 text-sm font-black text-brand-blue">Built for job seekers, SMEs and professionals in Kenya.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href={primaryHref}>Create My Document <ArrowRight className="h-4 w-4" /></ButtonLink>
          <ButtonLink href={secondaryHref} variant="secondary">View Pricing</ButtonLink>
        </div>
        <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
          <TrustBadge label="M-Pesa checkout" />
          <TrustBadge label="Editable outputs" />
          <TrustBadge label="Kenya-ready tone" />
        </div>
      </div>
      <DocumentPreviewCard product="cv_builder" featured />
    </section>
  );
}

export function ProductCard({ productKey }: { productKey: ProductKey }) {
  const page = productPages.find((item) => item.key === productKey)!;
  const product = pricingProducts[productKey];
  return (
    <Link
      href={productUrl(productKey)}
      className="group rounded-lg border border-black/10 p-5 transition hover:-translate-y-1 hover:border-brand-blue hover:shadow-soft dark:border-white/10"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-blue text-white">
        <FileText className="h-5 w-5" />
      </div>
      <h3 className="mt-5 text-xl font-black">{product.productName}</h3>
      <p className="mt-3 text-sm leading-6 text-black/58 dark:text-white/58">{page.solution}</p>
      <div className="mt-5 flex items-center justify-between text-sm font-black">
        <span>{formatKes(product.price)}</span>
        <span className="text-brand-blue group-hover:translate-x-1 transition">Explore</span>
      </div>
    </Link>
  );
}

export function PricingCard({ productId, highlight = false }: { productId: ProductId; highlight?: boolean }) {
  const product = pricingProducts[productId];
  return (
    <div className={cn("rounded-lg border p-5", highlight ? "border-brand-blue bg-black text-white shadow-soft" : "border-black/10 dark:border-white/10")}>
      <h3 className="text-xl font-black">{product.productName}</h3>
      <p className={cn("mt-3 min-h-12 text-sm leading-6", highlight ? "text-white/65" : "text-black/58 dark:text-white/58")}>{product.description}</p>
      <div className="mt-5 text-4xl font-black">{formatKes(product.price)}</div>
      <ul className="mt-5 space-y-3">
        {product.features.map((feature) => (
          <li key={feature} className="flex gap-2 text-sm font-semibold">
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-brand-blue" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <ButtonLink className="mt-6 w-full" href={`/dashboard/projects/new?product=${product.productId === "cv_cover_bundle" ? "cv_builder" : product.productId}`} variant={highlight ? "secondary" : "primary"}>
        Start now
      </ButtonLink>
    </div>
  );
}

export function FAQAccordion({ items = faqs }: { items?: Array<{ question: string; answer: string }> }) {
  return (
    <div className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
      {items.map((item) => (
        <details key={item.question} className="group p-5">
          <summary className="cursor-pointer list-none text-base font-black">{item.question}</summary>
          <p className="mt-3 text-sm leading-6 text-black/58 dark:text-white/58">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}

export function DocumentPreviewCard({ product, featured = false }: { product: ProductKey; featured?: boolean }) {
  const page = productPages.find((item) => item.key === product)!;
  return (
    <div className={cn("rounded-lg border border-black/10 bg-white p-4 shadow-soft dark:border-white/10 dark:bg-white/5", featured && "lg:rotate-1")}>
      <div className="rounded-lg border border-black/10 bg-white p-5 text-black dark:border-white/10">
        <div className="flex items-start justify-between gap-4 border-b border-black/10 pb-5">
          <div>
            <p className="text-xs font-black uppercase text-brand-blue">Sample preview</p>
            <h2 className="mt-2 text-2xl font-black">{pricingProducts[product].productName}</h2>
          </div>
          <Sparkles className="h-6 w-6 text-brand-blue" />
        </div>
        <div className="mt-5 space-y-4">
          <PreviewLine label="Structure" text={page.preview} />
          <PreviewLine label="Tone" text="Professional, direct, and suitable for Kenyan business and career contexts." />
          <PreviewLine label="Output" text="Editable sections with clean headings, spacing, and download-ready formatting." />
        </div>
      </div>
    </div>
  );
}

function PreviewLine({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-xs font-black uppercase text-black/45">{label}</p>
      <p className="mt-1 text-sm leading-6 text-black/70">{text}</p>
    </div>
  );
}

export function CheckoutCTA({ title = "Ready to create your document?", product = "cv_builder" }: { title?: string; product?: ProductKey }) {
  return (
    <section className="bg-black text-white">
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 px-4 py-12 md:flex-row md:items-center md:px-6">
        <div>
          <h2 className="text-3xl font-black">{title}</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/65">Pay securely with M-Pesa, generate with Solva Intelligence, edit, then download PDF or DOCX.</p>
        </div>
        <ButtonLink href={`/dashboard/projects/new?product=${product}`} variant="secondary">
          Create My Document <ArrowRight className="h-4 w-4" />
        </ButtonLink>
      </div>
    </section>
  );
}

export function ProgressSteps() {
  const steps = ["Choose product", "Fill guided form", "Pay with M-Pesa", "Edit and download"];
  return (
    <div className="grid gap-4 md:grid-cols-4">
      {steps.map((step, index) => (
        <div key={step} className="rounded-lg border border-black/10 p-5 dark:border-white/10">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue text-sm font-black text-white">{index + 1}</div>
          <p className="mt-4 text-sm font-black">{step}</p>
        </div>
      ))}
    </div>
  );
}

export function TrustBadge({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-xs font-black dark:border-white/10">
      <ShieldCheck className="h-4 w-4 text-brand-blue" />
      {label}
    </div>
  );
}

export function TestimonialCard() {
  return (
    <div className="rounded-lg border border-dashed border-black/20 p-5 dark:border-white/20">
      <div className="flex gap-1 text-brand-blue">{Array.from({ length: 5 }).map((_, index) => <Star key={index} className="h-4 w-4 fill-current" />)}</div>
      <p className="mt-4 text-sm font-semibold leading-6 text-black/65 dark:text-white/65">
        Placeholder testimonial. Live customer testimonials will appear here after approval and verification.
      </p>
      <p className="mt-4 text-sm font-black">Verified SolvaOne customer</p>
    </div>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-black/20 p-8 text-center dark:border-white/20">
      <TrendingUp className="mx-auto h-8 w-8 text-brand-blue" />
      <h3 className="mt-4 text-lg font-black">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-black/55 dark:text-white/55">{message}</p>
    </div>
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return <div className="rounded-lg border border-black/10 p-5 text-sm font-bold dark:border-white/10">{label}...</div>;
}

export function ErrorState({ message }: { message: string }) {
  return <div className="rounded-lg border border-black bg-white p-5 text-sm font-bold text-black dark:border-white dark:bg-black dark:text-white">{message}</div>;
}

export function SuccessState({ message }: { message: string }) {
  return <div className="rounded-lg border border-brand-blue p-5 text-sm font-bold text-brand-blue">{message}</div>;
}

export function DashboardMetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-black/10 p-5 dark:border-white/10">
      <p className="text-sm font-bold text-black/50 dark:text-white/50">{label}</p>
      <p className="mt-3 text-3xl font-black">{value}</p>
      {detail ? <p className="mt-2 text-xs font-semibold text-black/45 dark:text-white/45">{detail}</p> : null}
    </div>
  );
}
