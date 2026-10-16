import { createHash } from "node:crypto";

export function localApplicationLetter(name: string, title: string, company: string, cvId: string, cvHtml: string) {
  const clean = (value: string) => value.replace(/[\r\n\t]+/g, " ").trim();
  const letter = [
    "Dear Hiring Team,",
    `Please consider my application for ${clean(title)} at ${clean(company)}.`,
    "My attached CV provides my qualifications, employment history and experience for your review. I would welcome the opportunity to discuss how my documented background could contribute to this role.",
    "Thank you for considering my application.",
    "Yours sincerely,",
    clean(name),
  ].join("\n\n");
  const fingerprint = createHash("sha256").update(JSON.stringify({ version: 1, cvId, cvHtml, letter })).digest("hex");
  return { letter, evidence: `Local factual letter v1:${cvId}:${fingerprint}` };
}
