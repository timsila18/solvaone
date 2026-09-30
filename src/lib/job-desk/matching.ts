export type MatchableVacancy = { title: string; description: string; location: string; workplace_type: string };

export function scoreVacancy(vacancy: MatchableVacancy, profile: Record<string, unknown>) {
  const titles = ((profile.target_job_titles as string[]) ?? []).filter(Boolean);
  const locations = ((profile.preferred_locations as string[]) ?? []).filter(Boolean);
  const remote = String(profile.remote_preference ?? "flexible");
  const structured = (profile.structured_profile ?? {}) as Record<string, unknown>;
  const skills = ((structured.skills as string[]) ?? []).filter(Boolean).slice(0, 30);
  const words = (value: string) => new Set(value.toLowerCase().match(/[a-z]{3,}/g) ?? []);
  const jobTitle = words(vacancy.title);
  const description = vacancy.description.toLowerCase();
  let score = 0;
  const reasons: string[] = [];
  const gaps: string[] = [];
  const titleOverlap = Math.max(0, ...titles.map((title) => [...words(title)].filter((word) => jobTitle.has(word)).length));
  if (titleOverlap) { score += Math.min(45, 20 + titleOverlap * 10); reasons.push("Target role aligns with vacancy title"); }
  else gaps.push("Target role does not closely match the vacancy title");
  const matchingSkills = skills.filter((skill) => skill.length >= 3 && description.includes(skill.toLowerCase()));
  score += Math.min(30, matchingSkills.length * 6);
  if (matchingSkills.length) reasons.push(`Relevant skills: ${matchingSkills.slice(0, 5).join(", ")}`);
  if (vacancy.workplace_type === "remote" && ["remote", "flexible"].includes(remote)) { score += 15; reasons.push("Remote work preference aligns"); }
  else if (remote === "remote" && vacancy.workplace_type !== "remote") { score -= 25; gaps.push("Remote-only preference may not align"); }
  else if (locations.some((location) => vacancy.location.toLowerCase().includes(location.toLowerCase()))) { score += 15; reasons.push("Preferred location aligns"); }
  if (!titles.length) gaps.push("Candidate has not supplied a target role");
  return { score: Math.max(0, Math.min(100, score)), reasons, gaps };
}

export function submissionHoldReason(advert: string, candidateEmail: string | null, cvTextLength: number) {
  if (/\b(captcha|assessment|aptitude test|identity verification|passport copy|national id copy|application questionnaire|answer the following questions|complete the application form)\b/i.test(advert)) return "Advert requires an assessment, identity proof, form, or judgment-based answers.";
  if (!candidateEmail) return "Candidate email is missing.";
  if (cvTextLength < 500) return "Approved CV is too short for a verified application.";
  return null;
}
