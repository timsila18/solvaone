export type DraftQuestion = { id: string; category: string; question: string };
export type QuestionDraft = { answer: string; source: string; missing: boolean };
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
const text = (value: unknown) => typeof value === "string" && !/^(?:not provided|to be provided|unknown|n\/a)$/i.test(value.trim()) ? value.trim() : "";
const records = (value: unknown): Record<string,unknown>[] => Array.isArray(value) ? value.filter((item): item is Record<string,unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];

export function questionnaireDrafts(questions: DraftQuestion[], profile: Record<string,unknown>): Record<string,QuestionDraft> {
  const experience = records(profile.experience);
  const education = records(profile.education);
  return Object.fromEntries(questions.map(question => {
    const prompt = `${question.category} ${question.question}`.toLowerCase();
    let facts: string[] = [];
    let missing = false;
    if (/\b(tsc|registration number|licen[cs]e number)\b/.test(prompt)) {
      facts = strings(profile.certifications).filter(value => /\b(tsc|registration|licen[cs]e)\b/i.test(value));
      missing = !facts.length || !facts.some(value => /\b(?:tsc\s*(?:registration\s*)?(?:number|no\.?|#)?|registration\s*(?:number|no\.?|#)|licen[cs]e\s*(?:number|no\.?|#))\s*[:=-]?\s*\d{3,}\b/i.test(value));
      if (/current status/.test(prompt) && !facts.some(value => /\b(active|inactive|expired|valid|suspended)\b/i.test(value))) missing = true;
      if (missing) facts.push("Registration number and current status: Not provided. Do not infer active registration from a qualification.");
    } else if (/\b(date|dates|start|end|timeline|duration)\b/.test(prompt)) {
      const rows = /education|academic/.test(prompt) ? education : experience;
      facts = rows.map(row => {
        const start = text(row.startDate), end = text(row.endDate);
        if (!start || !end) missing = true;
        return `${[text(row.jobTitle ?? row.qualification),text(row.employer ?? row.institution)].filter(Boolean).join(" - ")}: ${start || "Start date: Not provided"} to ${end || "End date: Not provided"}`;
      });
    } else if (/\b(achievement|achievements|outcome|outcomes|impact|results|measurable|quantified)\b/.test(prompt)) {
      facts = experience.flatMap(row => strings(row.achievements).map(value => `${text(row.jobTitle)}: ${value}`));
    } else if (/\b(tool|tools|software|technolog\w*|skill|skills)\b/.test(prompt)) {
      facts = [...strings(profile.tools), ...strings(profile.skills)];
      if (/tool|software|technolog/.test(prompt) && !strings(profile.tools).length) {
        missing = true;
        facts.push("Specific software and technology tools: Not provided.");
      }
    } else if (/\b(certification|certifications|certificate|certificates|qualification|qualifications|education|academic)\b/.test(prompt)) {
      facts = [...education.map(row => [text(row.qualification),text(row.institution)].filter(Boolean).join(" - ")), ...strings(profile.certifications)];
    } else if (/\b(experience|duties|responsibilities|work history)\b/.test(prompt)) {
      facts = experience.flatMap(row => strings(row.responsibilities).map(value => `${[text(row.jobTitle),text(row.employer)].filter(Boolean).join(" - ")}: ${value}`));
    } else if (/\b(project|projects)\b/.test(prompt)) facts = strings(profile.projects);
    else if (/\b(leadership|volunteer)\b/.test(prompt)) facts = strings(profile.leadership);
    else if (/\b(language|languages)\b/.test(prompt)) facts = strings(profile.languages);
    else if (/\b(linkedin)\b/.test(prompt)) facts = [text(profile.linkedIn)];
    else if (/\b(email)\b/.test(prompt)) facts = [text(profile.email)];
    else if (/\b(phone|telephone)\b/.test(prompt)) facts = [text(profile.phone)];
    facts = [...new Set(facts.filter(Boolean))];
    if (!facts.length) missing = true;
    const answer = (facts.length ? facts.join("\n") : "Not provided in the saved CV profile. No additional facts supplied.").slice(0,4000);
    return [question.id,{answer,missing,source:"Saved CV profile"}];
  }));
}

export function mergeQuestionDrafts(questions: DraftQuestion[], responses: Record<string,string>, drafts: Record<string,QuestionDraft>) {
  return Object.fromEntries(questions.map(question => [question.id,responses[question.id]?.trim() ? responses[question.id] : drafts[question.id]?.answer ?? ""]));
}
