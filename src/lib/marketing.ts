import type { Metadata } from "next";
import type { ProductKey } from "@/lib/types";
import { pricingProducts } from "@/lib/pricing";
import { absoluteUrl } from "@/lib/utils";

export const site = {
  name: "SolvaOne",
  tagline: "Create. Apply. Grow.",
  parent: "Solva Business Group",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://solvaone.co.ke",
  supportEmail: "support@solvaone.co.ke",
  supportPhone: "+254 700 000 000"
};

export type ProductPage = {
  key: ProductKey;
  slug: string;
  headline: string;
  problem: string;
  solution: string;
  benefits: string[];
  receives: string[];
  faqs: Array<{ question: string; answer: string }>;
  preview: string;
};

export const productPages: ProductPage[] = [
  {
    key: "cv_builder",
    slug: "cv-builder",
    headline: "Build a professional CV that helps you stand out.",
    problem: "Many CVs bury strong experience inside weak wording, uneven sections, and missing role-specific keywords.",
    solution: "Solva Intelligence turns your details into a structured, recruiter-friendly CV for Kenyan and East African applications.",
    benefits: ["ATS-friendly structure", "Achievement-led wording", "Role-aligned skills", "Professional Kenya-ready tone"],
    receives: ["Professional summary", "Work experience bullets", "Skills and keywords", "Editable document"],
    preview: "A clean one-column CV with strong headings, measurable impact, and no unnecessary graphics.",
    faqs: [
      { question: "Can I edit the CV after generation?", answer: "Yes. You can edit every section and save versions before downloading." },
      { question: "Is it suitable for Kenyan jobs?", answer: "Yes. The prompts are tuned for Kenyan and East African professional applications." }
    ]
  },
  {
    key: "cv_revamp",
    slug: "cv-revamp",
    headline: "Turn your old CV into a polished, ATS-friendly CV.",
    problem: "Old CVs often read like job descriptions instead of evidence of impact.",
    solution: "Upload or paste your old CV and Solva Intelligence rewrites it with clearer structure, stronger language, and targeted keywords.",
    benefits: ["Stronger professional summary", "Improved bullet points", "ATS keyword suggestions", "Missing information notes"],
    receives: ["Revamped CV", "Improvement summary", "Keyword suggestions", "Recommendations"],
    preview: "A sharper CV rebuilt from existing content, with clutter removed and achievements elevated.",
    faqs: [
      { question: "Will it invent experience?", answer: "No. Missing information is marked as To be provided instead of being fabricated." },
      { question: "Can I use it for public sector roles?", answer: "Yes. Select Public Sector Application as your improvement goal." }
    ]
  },
  {
    key: "cover_letter",
    slug: "cover-letter",
    headline: "Generate a strong, role-specific cover letter in minutes.",
    problem: "Generic cover letters fail because they do not connect your experience to the specific organization and role.",
    solution: "SolvaOne creates a tailored, professional letter with a confident opening, evidence-led body, and clear closing.",
    benefits: ["Role-specific wording", "Professional salutation", "Evidence-based paragraphs", "Kenyan professional tone"],
    receives: ["Editable cover letter", "Role alignment", "Strong closing paragraph", "Download-ready draft"],
    preview: "A polished one-page letter designed for job applications, internships, NGOs, and management roles.",
    faqs: [
      { question: "Can I paste a job advert?", answer: "Yes. Add the advert text for tighter role matching." },
      { question: "Does it support graduate applications?", answer: "Yes. Graduate, internship, NGO, and public sector styles are supported." }
    ]
  },
  {
    key: "company_profile",
    slug: "company-profile",
    headline: "Create a premium company profile for your business, tenders and clients.",
    problem: "Many SMEs lose credibility because their company profiles are thin, poorly structured, or not tender-ready.",
    solution: "Solva Intelligence builds a credible company profile with overview, services, compliance, projects, and contact sections.",
    benefits: ["Tender-ready structure", "Premium business tone", "Service and project sections", "Compliance-friendly layout"],
    receives: ["Cover page content", "Company overview", "Services", "Compliance and contacts"],
    preview: "A sectioned company profile for SMEs, contractors, suppliers, consultancies, and service businesses.",
    faqs: [
      { question: "Can it include licenses and projects?", answer: "Yes. Add certifications, licenses, and past projects in the guided form." },
      { question: "Is it suitable for tenders?", answer: "Yes. The structure is designed to feel credible and tender-ready." }
    ]
  },
  {
    key: "business_plan",
    slug: "business-plan",
    headline: "Generate a practical business plan for funding, growth and execution.",
    problem: "Business plans can become vague, overlong, or disconnected from the actual market and operating plan.",
    solution: "SolvaOne creates a structured plan covering the business model, market, competitors, operations, revenue, risks, and roadmap.",
    benefits: ["Investor-readable sections", "Kenya SME context", "Financial assumptions", "Implementation roadmap"],
    receives: ["Executive summary", "Market analysis", "Financial plan", "Roadmap and conclusion"],
    preview: "A detailed business plan built for SMEs, startups, founders, and funding conversations.",
    faqs: [
      { question: "Does it calculate financials automatically?", answer: "It structures the financial plan from the assumptions you provide." },
      { question: "Can I revise sections later?", answer: "Yes. You can improve, shorten, expand, or regenerate sections in the editor." }
    ]
  }
];

export const faqs = [
  { question: "How does SolvaOne work?", answer: "Choose a product, fill the guided form, pay through M-Pesa, generate with Solva Intelligence, edit, then download." },
  { question: "Do I pay before downloading?", answer: "Yes. Downloads are unlocked only after confirmed payment." },
  { question: "Will SolvaOne create fake details?", answer: "No. Missing qualifications, referees, certifications, or experience are marked as To be provided." },
  { question: "Can I edit generated documents?", answer: "Yes. Documents remain editable with autosave and version history." },
  { question: "What happens if generation fails after payment?", answer: "Your payment remains valid and you can retry generation without paying again." }
];

export const resourcePosts = [
  {
    slug: "professional-cv-kenya",
    title: "How to write a professional CV in Kenya",
    excerpt: "A practical guide to structure, tone, and evidence for Kenyan job applications.",
    keyword: "Professional CV Kenya"
  },
  {
    slug: "ats-friendly-cv",
    title: "How to make your CV ATS-friendly",
    excerpt: "Simple ways to improve CV readability for recruiters and applicant tracking systems.",
    keyword: "CV builder Kenya"
  },
  {
    slug: "cover-letter-format",
    title: "Best cover letter format for job applications",
    excerpt: "A clean structure for opening, evidence, fit, and closing without sounding generic.",
    keyword: "Cover letter Kenya"
  },
  {
    slug: "company-profile-for-tenders",
    title: "How to write a company profile for tenders",
    excerpt: "What Kenyan SMEs should include when preparing a tender-ready company profile.",
    keyword: "Tender company profile Kenya"
  },
  {
    slug: "business-plan-kenya",
    title: "How to write a business plan in Kenya",
    excerpt: "A practical outline for market, operations, revenue, risks, and funding needs.",
    keyword: "Business plan Kenya"
  }
];

export function productUrl(key: ProductKey) {
  return `/products/${productPages.find((item) => item.key === key)?.slug ?? key}`;
}

export function productMetadata(page: ProductPage): Metadata {
  const product = pricingProducts[page.key];
  const title = `${product.productName} Kenya`;
  const description = `${page.headline} ${product.description}`;
  const url = absoluteUrl(productUrl(page.key));
  return {
    title,
    description,
    alternates: { canonical: url },
    keywords: [
      `${product.productName} Kenya`,
      "SolvaOne",
      "Solva Intelligence",
      "Professional documents Kenya"
    ],
    openGraph: { title, description, url, type: "website" },
    twitter: { card: "summary_large_image", title, description }
  };
}
