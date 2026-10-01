export type MatchableVacancy = { title: string; description: string; location: string; workplace_type: string };

const generic = new Set(["and", "the", "for", "with", "senior", "junior", "lead", "head", "officer", "specialist", "associate", "manager", "assistant", "executive", "remote", "global"]);
const words = (value: string) => new Set((value.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((word) => !generic.has(word)));
const list = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];

const skillText = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function documentedSkillMatches(skill: string, advert: string) {
  const phrase = skillText(skill);
  const text = ` ${skillText(advert)} `;
  if (phrase.length < 3) return false;
  if (text.includes(` ${phrase} `)) return true;
  // Only explicit equivalent phrases, not arbitrary single-word overlap.
  const equivalents = [
    ["key account management", "account management", "managing key accounts"],
    ["customer relationship management", "client relationship management", "crm"],
    ["sales forecasting", "sales forecasts", "forecasting sales"],
    ["team leadership", "team management", "leading sales teams"],
    ["distributor management", "distribution management", "managing distributors"],
    ["route to market", "route to market strategy"],
    ["business development", "new business development"]
  ];
  return equivalents.some(group => group.includes(phrase) && group.some(item => text.includes(` ${item} `)));
}

export function expiredDeadline(advert: string, now = new Date()) {
  const match = advert.match(/\b(?:application\s+deadline|closing\s+date|apply\s+by)\s*[:\-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\s+[a-z]+\s+\d{4})\b/i);
  if (!match) return false;
  const parsed = new Date(match[1]);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() + 86400000 < now.getTime();
}

export function vacancyEligibility(vacancy: MatchableVacancy, profile: Record<string, unknown>): string | null {
  const location = vacancy.location.toLowerCase();
  const advert = `${vacancy.title} ${vacancy.description}`.toLowerCase();
  const remote = String(profile.remote_preference ?? "flexible");
  const locations = list(profile.preferred_locations).map((item) => item.toLowerCase());
  if (expiredDeadline(vacancy.description)) return "Advert's stated application deadline has passed.";
  const kenya = /\b(kenya|nairobi|mombasa|kisumu|nakuru|eldoret)\b/i;
  const worldwide = /\b(worldwide|anywhere|global|africa|emea|east africa)\b/i;
  const explicitExclusion = /\b(?:us|usa|united states|canada|uk|united kingdom|europe|eu|australia|apac|americas)\s*(?:only|based|residents?|citizens?|work authorization|work permit|time zones?)\b|\b(?:only|must be based in|residents? of|citizens? of|authorized to work in|work authorization in|work permit for)\s+(?:the\s+)?(?:us|usa|united states|canada|uk|united kingdom|europe|eu|australia|apac|americas)\b/i;
  if (explicitExclusion.test(advert) || explicitExclusion.test(location)) return "Location or work-authorization restriction may exclude a candidate based in Kenya.";
  if (remote === "remote" && vacancy.workplace_type !== "remote") return "Candidate requested remote work only.";
  if (vacancy.workplace_type === "remote") {
    if (location && !kenya.test(location) && !worldwide.test(location) && !/^remote$/i.test(location.trim())) return "Remote role is restricted to another location.";
  } else if (!kenya.test(location) && !(location === "" && kenya.test(advert))) return "On-site or unspecified role has no clear Kenya eligibility.";
  if (locations.length && vacancy.workplace_type !== "remote" && !locations.some((item) => location.includes(item) || item.includes(location)) && !locations.includes("kenya")) return "Role is outside preferred locations.";
  const structured = (profile.structured_profile ?? {}) as Record<string, unknown>;
  const experience = Array.isArray(structured.experience) ? structured.experience as Array<Record<string, unknown>> : [];
  const totalYears = Number.parseFloat(String(structured.totalYearsExperience ?? ""));
  if (/\b(?:director|vice president|chief|cfo|cto|ceo)\b/i.test(vacancy.title) && Number.isFinite(totalYears) && totalYears < 5) return "Leadership seniority exceeds the documented experience.";
  const requirement = advert.match(/(?:minimum|at least|requires?|minimum of)\s+(\d{1,2})\+?\s+years?\s+(?:of\s+)?experience/i);
  if (requirement && Number.isFinite(totalYears) && totalYears + 1 < Number(requirement[1])) return "Advert requires more years of experience than the CV documents.";
  if (/\b(?:internship|graduate trainee)\b/i.test(vacancy.title) && experience.length > 3 && Number.isFinite(totalYears) && totalYears > 8) return "Entry-level placement is below the candidate's career level.";
  return null;
}

export function scoreVacancy(vacancy: MatchableVacancy, profile: Record<string, unknown>, scope?: { targetRoles?: string[]; preferredLocations?: string[]; remotePreference?: string; includeBroaderRoles?: boolean; broaderRoles?: string[]; broaderSeniority?: string; minimumMonthlyKes?: number; includeUnspecifiedKenyaLocations?: boolean } | null) {
  const scopedProfile = {
    ...profile,
    preferred_locations: scope?.preferredLocations ?? profile.preferred_locations,
    remote_preference: scope?.remotePreference ?? profile.remote_preference
  };
  if (scope?.includeUnspecifiedKenyaLocations && skillText(vacancy.location) === "kenya") {
    scopedProfile.preferred_locations = [...list(scopedProfile.preferred_locations), "Kenya"];
  }
  const blocker = vacancyEligibility(vacancy, scopedProfile);
  if (blocker) return { score: 0, reasons: [] as string[], gaps: [blocker] };
  const structured = (profile.structured_profile ?? {}) as Record<string, unknown>;
  const experience = Array.isArray(structured.experience) ? structured.experience as Array<Record<string, unknown>> : [];
  const targetTitles = [...(scope?.targetRoles ?? list(profile.target_job_titles)), String(structured.targetHeadline ?? "")].filter(Boolean);
  const supportedTitles = [...targetTitles, ...experience.map((item) => String(item.jobTitle ?? ""))].filter(Boolean);
  const skills = [...list(structured.skills), ...list(structured.tools)].slice(0, 50);
  const titleWords = words(vacancy.title);
  const description = vacancy.description.toLowerCase();
  const overlap = Math.max(0, ...supportedTitles.map((title) => [...words(title)].filter((word) => titleWords.has(word)).length));
  const broaderOverlap = scope?.includeBroaderRoles && (scope.broaderRoles ?? []).some(title => {
    const terms = [...words(title)];
    return terms.length > 0 && terms.every(term => titleWords.has(term));
  });
  const matchingSkills = [...new Set(skills.map(skill => skillText(skill)))].filter(skill => documentedSkillMatches(skill, description));
  const industries = list(structured.industries).filter((industry) => industry.length > 3 && description.includes(industry.toLowerCase()));
  const reasons: string[] = [];
  const gaps: string[] = [];
  if (!supportedTitles.length && !skills.length) return { score: 0, reasons, gaps: ["Candidate has not supplied a target role or CV skill evidence."] };
  const isBroader = overlap === 0;
  if (isBroader && (!broaderOverlap || matchingSkills.length < 2)) return { score: 0, reasons, gaps: ["Broader role needs explicit opt-in, an accepted job title and at least two documented skills."] };
  if (isBroader) {
    if (scope?.broaderSeniority !== "any" && /\b(intern|internship|trainee|graduate|entry.level|junior)\b/i.test(vacancy.title)) return { score: 0, reasons, gaps: ["Broader role is below the accepted career level."] };
    if (scope?.broaderSeniority === "senior" && !/\b(senior|lead|head|manager|supervisor|director)\b/i.test(vacancy.title)) return { score: 0, reasons, gaps: ["Broader role does not meet the senior-level preference."] };
    if (scope?.minimumMonthlyKes) {
      const salary = vacancy.description.match(/(?:KES|KSh)\s*([\d,]+)(?:\s*[-–]\s*(?:KES|KSh)?\s*([\d,]+))?\s*(?:per month|monthly|\/month|p\.?m\.?)/i);
      if (!salary || Number(salary[1].replace(/,/g, "")) < scope.minimumMonthlyKes) return { score: 0, reasons, gaps: ["Advert does not confirm the minimum monthly KES salary."] };
    }
  }
  let score = Math.min(48, overlap * 23) + Math.min(32, matchingSkills.length * 8) + Math.min(10, industries.length * 5);
  if (overlap) reasons.push("Role aligns with target or documented experience");
  else { score += 20; reasons.push("Transferable-skills match: opted-in broader role supported by documented skills"); }
  if (matchingSkills.length) reasons.push(`CV skills: ${matchingSkills.slice(0, 5).join(", ")}`);
  if (vacancy.workplace_type === "remote") { score += 10; reasons.push("Remote arrangement is potentially accessible from Kenya"); }
  else if (/\b(kenya|nairobi|mombasa|kisumu|nakuru|eldoret)\b/i.test(vacancy.location)) { score += 10; reasons.push("Location is in Kenya"); }
  if (overlap === 1 && matchingSkills.length === 0) gaps.push("Only one title term matched; review duties carefully.");
  return { score: Math.max(0, Math.min(100, score)), reasons, gaps };
}

export function submissionHoldReason(advert: string, candidateEmail: string | null, cvTextLength: number) {
  if (/\b(captcha|assessment|aptitude test|identity verification|passport copy|national id copy|application questionnaire|answer the following questions|complete the application form)\b/i.test(advert)) return "Advert requires an assessment, identity proof, form, or judgment-based answers.";
  if (!candidateEmail) return "Candidate email is missing.";
  if (cvTextLength < 500) return "Approved CV is too short for a verified application.";
  return null;
}
