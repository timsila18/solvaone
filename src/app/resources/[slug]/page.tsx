import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/marketing/public-shell";
import { CheckoutCTA } from "@/components/marketing/sections";
import { resourcePosts, site } from "@/lib/marketing";

const articleBodies: Record<string, Array<{ heading: string; paragraphs: string[]; bullets?: string[] }>> = {
  "professional-cv-kenya": [
    {
      heading: "Start With A Clear Professional Positioning",
      paragraphs: ["A strong professional CV in Kenya should quickly show who you are, what role you are targeting, and why your experience fits that role. Recruiters should not have to search through the document to understand your value."]
    },
    {
      heading: "Use Evidence Instead Of Duties Only",
      paragraphs: ["Instead of listing responsibilities alone, rewrite experience around contribution, scope, tools, clients, teams, and outcomes. Where you do not have numbers, describe the practical result without inventing metrics."],
      bullets: ["Mention systems, sectors, clients, or departments served.", "Use action verbs and concise achievement-led bullets.", "Keep referees, certificates, and qualifications truthful."]
    }
  ],
  "ats-friendly-cv": [
    {
      heading: "Keep The Structure Simple",
      paragraphs: ["An ATS-friendly CV uses clear section headings, readable text, and role-relevant keywords. Avoid complicated tables, heavy graphics, and image-based text when applying through online job portals."]
    },
    {
      heading: "Match Keywords Honestly",
      paragraphs: ["Use keywords from the job advert only when they genuinely match your experience. Good keywords often include job titles, tools, certifications, industries, and technical responsibilities."],
      bullets: ["Use a professional summary with the target role.", "Add a core skills section.", "Mirror important job advert terms truthfully."]
    }
  ],
  "cover-letter-format": [
    {
      heading: "Make The Letter Specific To The Role",
      paragraphs: ["A good cover letter should connect your background to the exact role, organization, and industry. Generic letters feel fast, but they rarely persuade."]
    },
    {
      heading: "Use A Four-Part Structure",
      paragraphs: ["Start with a clear salutation, then write a confident opening, evidence-based body, and polite closing. Keep the tone professional and direct."],
      bullets: ["Name the role you are applying for.", "Use one or two relevant achievements.", "Close with availability and appreciation."]
    }
  ],
  "company-profile-for-tenders": [
    {
      heading: "Build Trust Before Listing Services",
      paragraphs: ["A tender-ready company profile should show credibility, capability, compliance, and contact details. It should help procurement teams understand what your business does and why it can deliver."]
    },
    {
      heading: "Include The Sections Tender Reviewers Expect",
      paragraphs: ["Useful sections include company overview, background, mission, vision, services, management, past projects, certifications, compliance documents, and contacts."],
      bullets: ["Do not invent licenses or clients.", "Mark missing compliance details as To be provided.", "Describe services in practical delivery language."]
    }
  ],
  "business-plan-kenya": [
    {
      heading: "Make The Plan Practical",
      paragraphs: ["A useful business plan in Kenya should explain the business model, target customers, products, pricing, operations, competition, risks, and financial assumptions. It should guide execution, not just impress on paper."]
    },
    {
      heading: "Financial Assumptions Must Be Clear",
      paragraphs: ["If exact numbers are not available, mark them as assumptions or To be provided. Investors, lenders, and partners need to see how revenue, costs, and funding needs are connected."],
      bullets: ["Include startup costs and revenue streams.", "Explain marketing and operations.", "Add a practical implementation roadmap."]
    }
  ]
};

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
    keywords: [post.keyword, "SolvaOne", "Solva Intelligence", "Kenya professional documents"],
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      url: `/resources/${post.slug}`
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt
    },
    robots: { index: true, follow: true }
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
        <div className="mt-10 space-y-8">
          {(articleBodies[post.slug] ?? []).map((section) => (
            <section key={section.heading}>
              <h2 className="text-2xl font-black">{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="mt-4 text-sm leading-7 text-black/60 dark:text-white/60">{paragraph}</p>
              ))}
              {section.bullets ? (
                <ul className="mt-5 space-y-3 text-sm leading-6 text-black/60 dark:text-white/60">
                  {section.bullets.map((bullet) => <li key={bullet}>- {bullet}</li>)}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </article>
      <CheckoutCTA title="Use SolvaOne to put this guidance into practice." />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: post.title,
            description: post.excerpt,
            author: {
              "@type": "Organization",
              name: "Solva Business Group"
            },
            publisher: {
              "@type": "Organization",
              name: "SolvaOne"
            },
            mainEntityOfPage: `${site.url}/resources/${post.slug}`
          })
        }}
      />
    </PublicShell>
  );
}
