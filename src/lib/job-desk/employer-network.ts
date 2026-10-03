import { z } from "zod";

export const employerLeadSubject = "Job Hunting employer vacancy";
const text = (max: number) => z.string().trim().min(2).max(max);
export const employerVacancySchema = z.object({
  company: text(160), contactName: text(120), email: z.string().trim().email().max(254), phone: text(30),
  title: text(160), location: text(160), requirements: text(6000),
  applicationEmail: z.string().trim().email().max(254),
  advertUrl: z.string().trim().url().max(1000).refine(value => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.hostname.includes(".") && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/i.test(url.hostname);
  }, "Use a public HTTPS advert link."),
  closingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  authorized: z.literal(true), noFees: z.literal(true)
});
export function employerDeadlineOpen(date: string, now = new Date()) {
  const deadline = Date.parse(`${date}T23:59:59+03:00`);
  return Number.isFinite(deadline) && new Date(deadline).toISOString().slice(0, 10) === date && deadline > now.getTime() && deadline <= now.getTime() + 90 * 86400000;
}
export function readEmployerLead(message: string) {
  try { return employerVacancySchema.safeParse(JSON.parse(message)); }
  catch { return employerVacancySchema.safeParse(null); }
}
