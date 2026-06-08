import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/marketing/contact-form";
import { PublicShell } from "@/components/marketing/public-shell";
import { site } from "@/lib/marketing";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact SolvaOne support for payments, document generation, and account help.",
  alternates: { canonical: "/contact" }
};

export default function ContactPage() {
  return (
    <PublicShell>
      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:px-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h1 className="text-5xl font-black leading-[1.04] md:text-6xl">Contact SolvaOne support.</h1>
          <p className="mt-5 text-lg font-semibold leading-8 text-black/65 dark:text-white/65">
            Get help with payments, generated documents, downloads, receipts, or account access.
          </p>
          <div className="mt-8 space-y-4 text-sm font-semibold text-black/60 dark:text-white/60">
            <p>Email: {site.supportEmail}</p>
            <p>WhatsApp/Phone: {site.supportPhone}</p>
            <Link href="/faq" className="text-brand-blue">Read common questions</Link>
          </div>
        </div>
        <ContactForm />
      </section>
    </PublicShell>
  );
}
