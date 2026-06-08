import type { ProductKey } from "./types";

export type ProductId = ProductKey | "cv_cover_bundle";

export type PricingProduct = {
  productId: ProductId;
  productName: string;
  category: "career" | "business";
  price: number;
  currency: "KES";
  description: string;
  features: string[];
  isActive: boolean;
};

export const pricingProducts: Record<ProductId, PricingProduct> = {
  cv_builder: {
    productId: "cv_builder",
    productName: "CV Builder",
    category: "career",
    price: 299,
    currency: "KES",
    description: "Create a detailed ATS-friendly CV with Solva Intelligence.",
    features: ["Guided CV builder", "ATS keywords", "Editable document", "PDF and DOCX download"],
    isActive: true
  },
  cv_revamp: {
    productId: "cv_revamp",
    productName: "CV Revamp",
    category: "career",
    price: 499,
    currency: "KES",
    description: "Rewrite and upgrade an existing CV professionally.",
    features: ["Old CV cleanup", "Achievement bullets", "ATS improvement", "Missing information notes"],
    isActive: true
  },
  cover_letter: {
    productId: "cover_letter",
    productName: "Cover Letter",
    category: "career",
    price: 199,
    currency: "KES",
    description: "Generate a tailored professional cover letter.",
    features: ["Role-specific letter", "Kenyan professional tone", "Editable document", "PDF and DOCX download"],
    isActive: true
  },
  cv_cover_bundle: {
    productId: "cv_cover_bundle",
    productName: "CV + Cover Letter Bundle",
    category: "career",
    price: 699,
    currency: "KES",
    description: "Bundle a premium CV with a tailored cover letter.",
    features: ["CV Builder", "Cover Letter", "ATS keywords", "Better value"],
    isActive: true
  },
  company_profile: {
    productId: "company_profile",
    productName: "Company Profile",
    category: "business",
    price: 999,
    currency: "KES",
    description: "Create a tender-ready company profile for Kenyan SMEs.",
    features: ["Tender-ready structure", "Services and compliance sections", "Editable profile", "PDF and DOCX download"],
    isActive: true
  },
  business_plan: {
    productId: "business_plan",
    productName: "Business Plan",
    category: "business",
    price: 1499,
    currency: "KES",
    description: "Generate a practical business plan for SMEs and startups.",
    features: ["Investor-readable plan", "Market and operations sections", "Financial assumptions", "Implementation roadmap"],
    isActive: true
  }
};

export function getPricingProduct(productId: string) {
  return pricingProducts[productId as ProductId] ?? null;
}

export function productIdToGenerationProduct(productId: ProductId): ProductKey {
  return productId === "cv_cover_bundle" ? "cv_builder" : productId;
}
