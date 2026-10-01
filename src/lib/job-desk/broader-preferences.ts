import { z } from "zod";

export const broaderPreferenceFields = {
  includeBroaderRoles: z.enum(["true", "false"]).optional().default("false"),
  broaderRoles: z.string().trim().max(1000).optional().default(""),
  broaderSeniority: z.enum(["any", "professional", "senior"]).optional().default("professional"),
  minimumMonthlyKes: z.string().trim().regex(/^\d{0,7}$/).optional().default("")
};

export function validateBroaderPreferences(value: { includeBroaderRoles: string; broaderRoles: string }, context: z.RefinementCtx) {
  if (value.includeBroaderRoles === "true" && !value.broaderRoles.trim()) context.addIssue({ code: "custom", path: ["broaderRoles"], message: "Specify the broader roles the client accepts." });
}
