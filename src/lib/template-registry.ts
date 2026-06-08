import type { ProductKey } from "./types";

export type TemplateCategory = "cv" | "business_plan" | "company_profile" | "tender_procurement" | "invoice";

export type DocumentTemplate = {
  id: string;
  category: TemplateCategory;
  products: ProductKey[];
  name: string;
  description: string;
  sourcePath?: string;
  previewPath?: string;
  fileType: "doc" | "docx" | "pdf" | "xlsx" | "webp" | "jpg";
  tags: string[];
};

export const documentTemplates: DocumentTemplate[] = [
  {
    id: "cv-professional-summary-clean",
    category: "cv",
    products: ["cv_builder", "cv_revamp"],
    name: "Professional Summary Clean",
    description: "Compact professional summary DOCX template for quick CV profile generation.",
    sourcePath: "templates/source/cv/professional-summary-17.docx",
    fileType: "docx",
    tags: ["cv", "summary", "professional"]
  },
  {
    id: "cv-white-blue-minimalist",
    category: "cv",
    products: ["cv_builder", "cv_revamp"],
    name: "White and Blue Minimalist CV",
    description: "Minimalist blue CV layout for professional and corporate roles.",
    sourcePath: "templates/source/cv/white-blue-minimalist-cv.pdf",
    previewPath: "/template-previews/cv/best-resume.webp",
    fileType: "pdf",
    tags: ["cv", "minimalist", "blue"]
  },
  {
    id: "cv-blue-gray-simple",
    category: "cv",
    products: ["cv_builder", "cv_revamp"],
    name: "Blue and Gray Simple CV",
    description: "Simple structured CV layout with balanced gray and blue sections.",
    sourcePath: "templates/source/cv/blue-gray-simple-cv.pdf",
    previewPath: "/template-previews/cv/business-resume.webp",
    fileType: "pdf",
    tags: ["cv", "simple", "blue", "gray"]
  },
  {
    id: "cv-black-white-minimalist",
    category: "cv",
    products: ["cv_builder", "cv_revamp"],
    name: "Black and White Minimalist CV",
    description: "Clean monochrome CV reference for executive and formal applications.",
    sourcePath: "templates/source/cv/black-white-minimalist-cv.pdf",
    previewPath: "/template-previews/cv/supervisor-resume.webp",
    fileType: "pdf",
    tags: ["cv", "minimalist", "monochrome"]
  },
  {
    id: "cv-hr-professional",
    category: "cv",
    products: ["cv_builder", "cv_revamp"],
    name: "HR Professional CV",
    description: "Two-column HR CV reference with skills, certifications, and experience emphasis.",
    previewPath: "/template-previews/cv/hr-resume.webp",
    fileType: "webp",
    tags: ["cv", "hr", "two-column"]
  },
  {
    id: "cv-teacher-educator",
    category: "cv",
    products: ["cv_builder", "cv_revamp"],
    name: "Teacher Educator CV",
    description: "Education-focused CV reference for teachers and training professionals.",
    previewPath: "/template-previews/cv/teacher-resume.webp",
    fileType: "webp",
    tags: ["cv", "teacher", "education"]
  },
  {
    id: "cv-medical-assistant",
    category: "cv",
    products: ["cv_builder", "cv_revamp"],
    name: "Medical Assistant CV",
    description: "Healthcare CV reference with credentials and compliance-focused work history.",
    previewPath: "/template-previews/cv/medical-assistant-resume.webp",
    fileType: "webp",
    tags: ["cv", "medical", "healthcare"]
  },
  {
    id: "cv-data-engineer",
    category: "cv",
    products: ["cv_builder", "cv_revamp"],
    name: "Data Engineer CV",
    description: "Technical CV reference for data engineering, analytics, and software roles.",
    previewPath: "/template-previews/cv/data-engineer-resume.webp",
    fileType: "webp",
    tags: ["cv", "technology", "data"]
  },
  {
    id: "business-plan-2021-2026",
    category: "business_plan",
    products: ["business_plan"],
    name: "Five-Year Business Plan",
    description: "Formal multi-year business plan reference for strategy and growth planning.",
    sourcePath: "templates/source/business-plan/business-plan-2021-2026.pdf",
    fileType: "pdf",
    tags: ["business-plan", "strategy", "five-year"]
  },
  {
    id: "business-plan-lean-wooden-grain",
    category: "business_plan",
    products: ["business_plan"],
    name: "Lean Business Plan",
    description: "Lean business plan structure for concise venture planning.",
    sourcePath: "templates/source/business-plan/sample-lean-business-plan-wooden-grain-toy-company.doc",
    fileType: "doc",
    tags: ["business-plan", "lean", "startup"]
  },
  {
    id: "business-plan-consulting",
    category: "business_plan",
    products: ["business_plan"],
    name: "Consulting Business Plan",
    description: "Service-business plan reference for consulting and advisory companies.",
    sourcePath: "templates/source/business-plan/sample-business-plan-we-can-do-it-consulting.doc",
    fileType: "doc",
    tags: ["business-plan", "consulting", "services"]
  },
  {
    id: "company-profile-kenya-airways",
    category: "company_profile",
    products: ["company_profile"],
    name: "Aviation Company Profile",
    description: "Corporate profile reference for large service and aviation companies.",
    sourcePath: "templates/source/company-profile/kenya-airways-company-profile.pdf",
    fileType: "pdf",
    tags: ["company-profile", "aviation", "corporate"]
  },
  {
    id: "company-profile-safaricom",
    category: "company_profile",
    products: ["company_profile"],
    name: "Telecom Company Profile",
    description: "Enterprise profile reference for telecom and technology-led companies.",
    sourcePath: "templates/source/company-profile/safaricom-company-profile.pdf",
    fileType: "pdf",
    tags: ["company-profile", "telecom", "enterprise"]
  },
  {
    id: "tender-request-for-proposal",
    category: "tender_procurement",
    products: ["company_profile", "business_plan"],
    name: "Request for Proposal",
    description: "Standard procurement request-for-proposal template.",
    sourcePath: "templates/source/tender-procurement/doc-05-request-for-proposal.docx",
    fileType: "docx",
    tags: ["tender", "procurement", "proposal"]
  },
  {
    id: "tender-procurement-goods",
    category: "tender_procurement",
    products: ["company_profile", "business_plan"],
    name: "Procurement of Goods",
    description: "Standard goods procurement template for tender responses.",
    sourcePath: "templates/source/tender-procurement/doc-04-goods.docx",
    fileType: "docx",
    tags: ["tender", "procurement", "goods"]
  },
  {
    id: "tender-request-for-quotations",
    category: "tender_procurement",
    products: ["company_profile", "business_plan"],
    name: "Request for Quotations",
    description: "RFQ template for structured quotation-based procurement.",
    sourcePath: "templates/source/tender-procurement/doc-21-request-for-quotations.docx",
    fileType: "docx",
    tags: ["tender", "rfq", "quotations"]
  },
  {
    id: "invoice-modern",
    category: "invoice",
    products: ["company_profile"],
    name: "Modern Invoice",
    description: "Modern Word invoice template for business documents.",
    sourcePath: "templates/source/invoice/modern-invoice-word.docx",
    fileType: "docx",
    tags: ["invoice", "business", "word"]
  },
  {
    id: "invoice-letterhead",
    category: "invoice",
    products: ["company_profile"],
    name: "Letterhead Invoice",
    description: "Letterhead-style invoice template for company stationery packs.",
    sourcePath: "templates/source/invoice/letterhead-invoice-word.docx",
    fileType: "docx",
    tags: ["invoice", "letterhead", "company-profile"]
  }
];

export function templatesForProduct(product: ProductKey) {
  return documentTemplates.filter((template) => template.products.includes(product));
}

export function templateById(templateId?: string | null) {
  return documentTemplates.find((template) => template.id === templateId);
}
