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

// The model contract has only required fields; the application schema above
// remains responsible for validating content and applying any defaults.
export const jobDeskModelOutputSchema = z.object({
  candidateProfile: z.object({
    fullName: z.string(), email: z.string(), phone: z.string(), location: z.string(),
    linkedIn: z.string(), targetHeadline: z.string(), professionalSummary: z.string(),
    totalYearsExperience: z.string(), skills: z.array(z.string()), tools: z.array(z.string()),
    industries: z.array(z.string()),
    experience: z.array(z.object({
      jobTitle: z.string(), employer: z.string(), location: z.string(),
      startDate: z.string(), endDate: z.string(),
      responsibilities: z.array(z.string()), achievements: z.array(z.string())
    })),
    education: z.array(z.object({
      qualification: z.string(), institution: z.string(), location: z.string(),
      startDate: z.string(), endDate: z.string()
    })),
    certifications: z.array(z.string()), languages: z.array(z.string()),
    projects: z.array(z.string()), leadership: z.array(z.string())
  }),
  profileCompleteness: z.number(),
  revampedCv: z.object({
    title: z.string(), executiveSummary: z.string(),
    sections: z.array(z.object({
      id: z.string(), title: z.string(), html: z.string(), improvementNotes: z.array(z.string())
    })),
    qualityScores: z.object({
      completeness: z.number(), professionalTone: z.number(), structure: z.number(),
      ats: z.number(), achievementStrength: z.number(), recruiterReadability: z.number(),
      careerClarity: z.number(), notes: z.array(z.string())
    }),
    improvementNotes: z.array(z.string()), missingInformation: z.array(z.string()),
    atsKeywords: z.array(z.string()), improvementsMade: z.array(z.string())
  }),
  questionnaire: z.array(z.object({
    id: z.string(), category: z.string(), question: z.string(), reason: z.string(), required: z.boolean()
  })),
  processingNotes: z.array(z.string())
});

export type JobDeskProcessingOutput = z.infer<typeof jobDeskProcessingOutputSchema>;
