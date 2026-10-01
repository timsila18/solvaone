import { z } from "zod";

const optionalUrl = z.union([z.literal(""), z.string().trim().url().max(500).refine((value) => value.startsWith("https://"), "Use an HTTPS link.")]);

export const applicantDetailsSchema = z.object({
  currentCity: z.string().trim().max(120).default(""),
  currentCountry: z.string().trim().max(120).default(""),
  kenyaWorkEligibility: z.enum(["yes", "no", "unsure", "not_provided"]).default("not_provided"),
  sponsorshipNeeded: z.enum(["yes", "no", "unsure", "not_provided"]).default("not_provided"),
  noticePeriod: z.string().trim().max(120).default(""),
  applicantLinkedinUrl: optionalUrl.default(""),
  portfolioUrl: optionalUrl.default("")
});

export type ApplicantDetails = z.infer<typeof applicantDetailsSchema>;

export function readApplicantDetails(details: unknown): ApplicantDetails | null {
  if (!details || typeof details !== "object") return null;
  const parsed = applicantDetailsSchema.safeParse((details as { applicantDetails?: unknown }).applicantDetails);
  return parsed.success ? parsed.data : null;
}
