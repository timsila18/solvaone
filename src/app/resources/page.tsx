import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PublicShell } from "@/components/marketing/public-shell";
import { resourcePosts } from "@/lib/marketing";

export const metadata: Metadata = {
  title: "Resources",
  description: "SolvaOne guides for CVs, cover letters, company profiles, and business plans in Kenya.",
  alternates: { canonical: "/resources" },
  keywords: ["Professional CV Kenya", "Cover letter Kenya", "Company profile Kenya", "Business plan Kenya"]
};

export default function ResourcesPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-7xl px-4 py-14 md:px-6">
        <h1 className="max-w-3xl text-5xl font-black leading-[1.04] md:text-6xl">Resources for better applications and business documents.</h1>
        <p className="mt-5 max-w-2xl text-lg font-semibold leading-8 text-black/65 dark:text-white/65">
          Practical article foundations for job seekers, SMEs, founders, and professionals in Kenya.
        </p>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {resourcePosts.map((post) => (
            <Link key={post.slug} href={`/resources/${post.slug}`} className="rounded-lg border border-black/10 p-5 transition hover:border-brand-blue hover:shadow-soft dark:border-white/10">
              <p className="text-xs font-black uppercase text-brand-blue">{post.keyword}</p>
              <h2 className="mt-3 text-2xl font-black">{post.title}</h2>
              <p className="mt-3 text-sm leading-6 text-black/58 dark:text-white/58">{post.excerpt}</p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-brand-blue">
                Read foundation <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}
