import { z } from "zod";
import type { ProductKey } from "@/lib/types";

export const generationModeSchema = z.enum([
  "full_document",
  "regenerate_section",
  "improve_section",
  "make_more_professional",
  "make_shorter",
  "make_more_detailed",
  "fix_grammar",
  "add_achievements",
  "add_keywords"
]);

export type GenerationMode = z.infer<typeof generationModeSchema>;

export const qualityScoresSchema = z.object({
  completeness: z.number().min(0).max(100),
  professionalTone: z.number().min(0).max(100),
  structure: z.number().min(0).max(100),
  ats: z.number().min(0).max(100).optional(),
  tenderReadiness: z.number().min(0).max(100).optional(),
  businessClarity: z.number().min(0).max(100).optional(),
  notes: z.array(z.string()).min(1)
});

export const generatedSectionSchema = z.object({
  id: z.string().min(2),
  title: z.string().min(2),
  html: z.string().min(20),
  improvementNotes: z.array(z.string()).default([])
});

export const solvaOutputSchema = z.object({
  title: z.string().min(2),
  executiveSummary: z.string().min(20),
  sections: z.array(generatedSectionSchema).min(2),
  qualityScores: qualityScoresSchema,
  improvementNotes: z.array(z.string()).default([]),
  missingInformation: z.array(z.string()).default([]),
  atsKeywords: z.array(z.string()).default([]),
  improvementsMade: z.array(z.string()).default([])
});

export type QualityScores = z.infer<typeof qualityScoresSchema>;
export type SolvaOutput = z.infer<typeof solvaOutputSchema>;

export type GenerateDocumentInput = {
  userId: string;
  projectId: string;
  documentId: string;
  product: ProductKey;
  title: string;
  templateId?: string | null;
  payload: Record<string, unknown>;
  mode?: GenerationMode;
  sectionId?: string;
  sectionHtml?: string;
};

export type ProductPrompt = {
  system: string;
  developer: string;
  user: string;
};
