import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/marketing/public-shell";
import { CheckoutCTA } from "@/components/marketing/sections";
import { resourcePosts } from "@/lib/marketing";

export function generateStaticParams() {
  return resourcePosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = resourcePosts.find((item) => item.slug === slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/resources/${post.slug}` },
    keywords: [post.keyword, "SolvaOne", "Solva Intelligence"]
  };
}

export default async function ResourcePostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = resourcePosts.find((item) => item.slug === slug);
  if (!post) notFound();

  return (
    <PublicShell>
      <article className="mx-auto max-w-3xl px-4 py-14 md:px-6">
        <p className="text-xs font-black uppercase text-brand-blue">{post.keyword}</p>
        <h1 className="mt-4 text-5xl font-black leading-[1.04]">{post.title}</h1>
        <p className="mt-5 text-lg font-semibold leading-8 text-black/65 dark:text-white/65">{post.excerpt}</p>
        <div className="mt-10 rounded-lg border border-dashed border-black/20 p-6 dark:border-white/20">
          <h2 className="text-2xl font-black">Article foundation</h2>
          <p className="mt-4 text-sm leading-7 text-black/60 dark:text-white/60">
            This resource is prepared as a publishing foundation. Admin publishing tools can later replace this starter copy with a full article, cover image, author, and publication date from the blog table.
          </p>
          <ul className="mt-5 space-y-3 text-sm leading-6 text-black/60 dark:text-white/60">
            <li>- Define the document purpose clearly.</li>
            <li>- Use evidence, structure, and plain professional language.</li>
            <li>- Keep claims truthful and mark missing information before submission.</li>
            <li>- Edit the generated document before final download.</li>
          </ul>
        </div>
      </article>
      <CheckoutCTA title="Use SolvaOne to put this guidance into practice." />
    </PublicShell>
  );
}
