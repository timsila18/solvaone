import { z } from "zod";
import { solvaOutputSchema } from "@/lib/solva-intelligence/types";

const profileExperienceSchema = z.object({
  jobTitle: z.string().default(""),
  employer: z.string().default(""),
  location: z.string().default(""),
  startDate: z.string().default(""),
  endDate: z.string().default(""),
  responsibilities: z.array(z.string()).default([]),
  achievements: z.array(z.string()).default([])
});

const profileEducationSchema = z.object({
  qualification: z.string().default(""),
  institution: z.string().default(""),
  location: z.string().default(""),
  startDate: z.string().default(""),
  endDate: z.string().default("")
});

export const candidateProfileSchema = z.object({
  fullName: z.string().default(""),
  email: z.string().default(""),
  phone: z.string().default(""),
  location: z.string().default(""),
  linkedIn: z.string().default(""),
  targetHeadline: z.string().default(""),
  professionalSummary: z.string().default(""),
  totalYearsExperience: z.string().default(""),
  skills: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  industries: z.array(z.string()).default([]),
  experience: z.array(profileExperienceSchema).default([]),
  education: z.array(profileEducationSchema).default([]),
  certifications: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  projects: z.array(z.string()).default([]),
  leadership: z.array(z.string()).default([])
});

export const questionnaireItemSchema = z.object({
  id: z.string().min(2),
  category: z.string().min(2),
  question: z.string().min(5),
  reason: z.string().min(5),
  required: z.boolean().default(true)
});

export const jobDeskProcessingOutputSchema = z.object({
  candidateProfile: candidateProfileSchema,
  profileCompleteness: z.number().min(0).max(100),
  revampedCv: solvaOutputSchema,
  questionnaire: z.array(questionnaireItemSchema).max(20),
  processingNotes: z.array(z.string()).default([])
});

export type JobDeskProcessingOutput = z.infer<typeof jobDeskProcessingOutputSchema>;

