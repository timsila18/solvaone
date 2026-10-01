import type { JobDeskProcessingOutput } from "./types";

export function cvDepthIssue(output: JobDeskProcessingOutput) {
  const sections = output.revampedCv.sections;
  const text = sections.map((section) => section.html.replace(/<[^>]+>/g, " ")).join(" ").replace(/\s+/g, " ").trim();
  if (sections.length < 3 || text.length < 800) return { blocking: true, message: `The CV output is incomplete: ${sections.length} sections and ${text.length} characters of body text.` };
  if (sections.length < 5 || text.length < 3500) return { blocking: false, message: `This CV uses the available evidence but could be stronger. Ask the client for additional verified experience, achievements and skills before approval (${sections.length} sections; ${text.length} characters).` };
  return null;
}
