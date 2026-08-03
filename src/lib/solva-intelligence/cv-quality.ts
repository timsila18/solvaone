import type { ProductKey } from "@/lib/types";

export type CvQualityIssue = {
  key: string;
  label: string;
  severity: "info" | "warning" | "critical";
  question: string;
};

export type CvQualityReport = {
  isCv: boolean;
  readyForPremiumGeneration: boolean;
  careerMode: string;
  scores: {
    atsReadiness: number;
    achievementStrength: number;
    completeness: number;
    recruiterReadability: number;
    careerClarity: number;
  };
  detectedWeakAreas: CvQualityIssue[];
  followUpQuestions: string[];
  extractedAtsKeywords: string[];
  guidance: string[];
};

const cvModes = [
  "Graduate CV",
  "Professional CV",
  "Executive CV",
  "Technical CV",
  "NGO CV",
  "Public Service CV",
  "International CV",
  "Sales/Marketing CV",
  "Accounting/Admin CV"
];

const actionVerbs = [
  "achieved",
  "administered",
  "analyzed",
  "coordinated",
  "delivered",
  "developed",
  "improved",
  "increased",
  "led",
  "managed",
  "optimized",
  "organized",
  "prepared",
  "reduced",
  "resolved",
  "strengthened",
  "supervised"
];

const commonStopWords = new Set([
  "and",
  "are",
  "for",
  "from",
  "have",
  "with",
  "will",
  "you",
  "your",
  "the",
  "this",
  "that",
  "into",
  "their",
  "our",
  "job",
  "role",
  "work",
  "team",
  "must",
  "should",
  "candidate",
  "applicant"
]);

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function wordCount(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function hasMetric(value: string) {
  return /(\d+%|\b\d+\+?\b|ksh|kes|budget|revenue|sales|clients|customers|students|staff|employees|branches|projects|reports|turnaround|cost|profit|growth|reduced|increased|improved|saved)/i.test(value);
}

function hasDates(value: string) {
  return /\b(19|20)\d{2}\b|present|current|to date|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(value);
}

function hasActionVerb(value: string) {
  const lower = value.toLowerCase();
  return actionVerbs.some((verb) => lower.includes(verb));
}

function splitKeywords(value: string) {
  const counts = new Map<string, number>();
  for (const match of value.toLowerCase().matchAll(/\b[a-z][a-z+/#.-]{2,}\b/g)) {
    const keyword = match[0].replace(/[.,;:]+$/, "");
    if (commonStopWords.has(keyword) || keyword.length < 3) continue;
    counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 28)
    .map(([keyword]) => keyword);
}

function detectMode(payload: Record<string, unknown>) {
  const suppliedMode = text(payload.cvMode) || text(payload.cvStyle);
  const normalized = suppliedMode.toLowerCase();
  return cvModes.find((mode) => normalized.includes(mode.toLowerCase().replace(" cv", ""))) ?? (suppliedMode || "Professional CV");
}

function addIssue(issues: CvQualityIssue[], issue: CvQualityIssue) {
  if (!issues.some((item) => item.key === issue.key)) issues.push(issue);
}

export function analyzeCvInput(product: ProductKey, payload: Record<string, unknown>, brief = ""): CvQualityReport {
  const isCv = product === "cv_builder" || product === "cv_revamp";
  if (!isCv) {
    return {
      isCv: false,
      readyForPremiumGeneration: true,
      careerMode: "",
      scores: { atsReadiness: 0, achievementStrength: 0, completeness: 0, recruiterReadability: 0, careerClarity: 0 },
      detectedWeakAreas: [],
      followUpQuestions: [],
      extractedAtsKeywords: [],
      guidance: []
    };
  }

  const sourceCv = text(payload.oldCvContent);
  const workExperience = text(payload.workExperience) || sourceCv;
  const targetRole = text(payload.targetJobTitle);
  const industry = text(payload.industry) || text(payload.targetIndustry);
  const jobAdvert = text(payload.jobAdvertText) || text(payload.sourceBrief) || brief;
  const skills = text(payload.skills);
  const education = text(payload.education) || sourceCv;
  const personalDetails = text(payload.personalDetails) || sourceCv;
  const careerMode = detectMode(payload);
  const allText = [sourceCv, workExperience, targetRole, industry, jobAdvert, skills, education, personalDetails, brief].join(" ");
  const issues: CvQualityIssue[] = [];

  if (!targetRole) {
    addIssue(issues, {
      key: "missing_target_role",
      label: "Missing target role",
      severity: "critical",
      question: "What exact job title should this CV target?"
    });
  }

  if (!industry) {
    addIssue(issues, {
      key: "missing_industry",
      label: "Missing target industry",
      severity: "warning",
      question: "Which industry or sector should the CV be positioned for?"
    });
  }

  if (!hasDates(workExperience)) {
    addIssue(issues, {
      key: "missing_dates",
      label: "Missing dates",
      severity: "warning",
      question: "What dates did you work or study in each role, school, or project?"
    });
  }

  if (!hasMetric(workExperience)) {
    addIssue(issues, {
      key: "missing_measurable_impact",
      label: "No measurable impact",
      severity: "critical",
      question: "What results did you achieve, and can you add numbers such as clients, reports, sales, staff, projects, students, branches, money, or percentages?"
    });
  }

  if (wordCount(workExperience) < 120) {
    addIssue(issues, {
      key: "thin_work_history",
      label: "Work history is too brief",
      severity: "critical",
      question: "For each role, what did you handle daily, what tools did you use, who did you support, and what changed because of your work?"
    });
  }

  if (!hasActionVerb(workExperience)) {
    addIssue(issues, {
      key: "weak_job_descriptions",
      label: "Weak job descriptions",
      severity: "warning",
      question: "What was improved, reduced, increased, delivered, saved, resolved, coordinated, managed, or completed?"
    });
  }

  if (wordCount(skills) < 8 && !/skills|competenc|tools|software/i.test(sourceCv)) {
    addIssue(issues, {
      key: "poor_skills_alignment",
      label: "Poor skills alignment",
      severity: "warning",
      question: "Which technical skills, software, tools, sector knowledge, and soft skills should recruiters notice quickly?"
    });
  }

  if (!text(payload.experienceLevel) && !text(payload.yearsExperience)) {
    addIssue(issues, {
      key: "unclear_career_level",
      label: "Unclear career level",
      severity: "warning",
      question: "Is this a graduate, entry-level, mid-level, senior, executive, technical, NGO, public service, or international application?"
    });
  }

  const extractedAtsKeywords = splitKeywords([jobAdvert, targetRole, industry, skills].join(" "));
  const totalWords = wordCount(allText);
  const criticalCount = issues.filter((issue) => issue.severity === "critical").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  const completeness = clampScore(35 + Math.min(35, totalWords / 10) + (education ? 10 : 0) + (skills ? 10 : 0) - criticalCount * 13 - warningCount * 5);
  const achievementStrength = clampScore((hasMetric(workExperience) ? 42 : 12) + (hasActionVerb(workExperience) ? 28 : 8) + Math.min(30, wordCount(workExperience) / 8));
  const atsReadiness = clampScore(35 + (targetRole ? 18 : 0) + (industry ? 12 : 0) + Math.min(25, extractedAtsKeywords.length * 2) + (hasDates(workExperience) ? 10 : 0));
  const recruiterReadability = clampScore(45 + (targetRole ? 15 : 0) + (wordCount(workExperience) > 160 ? 20 : 5) + (skills ? 10 : 0) - warningCount * 4);
  const careerClarity = clampScore(40 + (targetRole ? 25 : 0) + (industry ? 15 : 0) + (careerMode ? 10 : 0) + (text(payload.experienceLevel) || text(payload.yearsExperience) ? 10 : 0));

  const readyForPremiumGeneration = criticalCount === 0 && completeness >= 62 && achievementStrength >= 50;

  return {
    isCv,
    readyForPremiumGeneration,
    careerMode,
    scores: {
      atsReadiness,
      achievementStrength,
      completeness,
      recruiterReadability,
      careerClarity
    },
    detectedWeakAreas: issues,
    followUpQuestions: issues.slice(0, 6).map((issue) => issue.question),
    extractedAtsKeywords,
    guidance: [
      "Premium bullet formula: Action + Scope + Tool/Method + Result/Business Value.",
      "Add truthful numbers wherever possible: clients, staff, sales, projects, reports, budgets, response time, students, or branches.",
      "Paste a job advert to improve ATS keyword matching and role alignment.",
      `Recommended mode: ${careerMode}.`
    ]
  };
}

export { cvModes };
