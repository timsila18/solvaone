import { z } from "zod";
import { generalJobFamilies } from "./general-jobs";

export const broaderPreferenceFields = {
  includeGeneralRoles: z.enum(["true", "false"]).optional().default("false"),
  generalRoleFamilies: z.string().trim().max(300).optional().default(""),
  includeBroaderRoles: z.enum(["true", "false"]).optional().default("false"),
  broaderRoles: z.string().trim().max(1000).optional().default(""),
  broaderSeniority: z.enum(["any", "professional", "senior"]).optional().default("professional"),
  minimumMonthlyKes: z.string().trim().regex(/^\d{0,7}$/).optional().default("")
};

export function validateBroaderPreferences(value: { includeBroaderRoles: string; broaderRoles: string; includeGeneralRoles?: string; generalRoleFamilies?: string }, context: z.RefinementCtx) {
  if (value.includeBroaderRoles === "true" && !value.broaderRoles.trim()) context.addIssue({ code: "custom", path: ["broaderRoles"], message: "Specify the broader roles the client accepts." });
  if (value.includeGeneralRoles === "true") {
    const families = (value.generalRoleFamilies ?? "").split(",").filter(Boolean);
    if (!families.length || families.some(id => !generalJobFamilies.some(family => family.id === id))) context.addIssue({ code: "custom", path: ["generalRoleFamilies"], message: "Select the general-job families the client accepts." });
  }
}
