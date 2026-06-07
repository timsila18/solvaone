export type ProductKey =
  | "cv_builder"
  | "cv_revamp"
  | "cover_letter"
  | "company_profile"
  | "business_plan";

export type ProjectStatus = "draft" | "awaiting_payment" | "paid" | "generating" | "ready" | "archived";

export type PaymentStatus = "pending" | "paid" | "failed" | "cancelled";

export type UserRole = "user" | "admin";

export const products: Record<ProductKey, { title: string; description: string; priceKes: number }> = {
  cv_builder: {
    title: "CV Builder",
    description: "Create a polished, ATS-aware CV from structured career inputs.",
    priceKes: 700
  },
  cv_revamp: {
    title: "CV Revamp",
    description: "Transform an existing CV into a sharper executive-ready version.",
    priceKes: 1200
  },
  cover_letter: {
    title: "Cover Letter Generator",
    description: "Generate targeted cover letters for roles and opportunities.",
    priceKes: 500
  },
  company_profile: {
    title: "Company Profile Generator",
    description: "Build a credible company profile for proposals and tenders.",
    priceKes: 2500
  },
  business_plan: {
    title: "Business Plan Generator",
    description: "Create investor-ready plans with market, operating, and financial sections.",
    priceKes: 3500
  }
};

export type ProjectRow = {
  id: string;
  user_id: string;
  product: ProductKey;
  title: string;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
};

export type DocumentRow = {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  content: Record<string, unknown>;
  html: string;
  format: string;
  version: number;
  created_at: string;
  updated_at: string;
};
