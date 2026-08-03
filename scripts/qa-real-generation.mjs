import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import OpenAI from "openai";

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^"|"$/g, "");
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const outputContract = `
Return ONLY valid JSON:
{
  "title": "Document title",
  "sections": [{"title":"Section Title","html":"<p>Semantic HTML content...</p>"}],
  "qualityScores": {"atsReadiness":0-100,"achievementStrength":0-100,"completeness":0-100,"recruiterReadability":0-100,"careerClarity":0-100,"professionalTone":0-100,"notes":["..."]},
  "followUpQuestions": ["..."],
  "atsKeywords": ["..."],
  "improvementsMade": ["..."],
  "missingInformation": ["To be provided: ..."]
}
No markdown fences. No platform branding inside the user-facing document.
`;

const cvStandard = `
Use SolvaOne premium CV standards:
- Diagnose, interview, rewrite, score, and polish.
- CV output should target a detailed 3-page professional CV when exported, without fake facts.
- CV output should contain 1,500-2,200 words across 9-12 useful sections when the user provides enough source material.
- Use role-specific mode and ATS keywords from job advert where supplied.
- Professional Summary must be 170-230 words.
- Core Competencies must include 24-36 role-aligned keywords grouped logically.
- Each professional experience role should include a short scope paragraph plus 7-9 substantial bullets where source facts support it.
- Bullets must be 22-38 words and follow: Action + Scope + Tool/Method + Result/Business Value.
- Include Selected Achievements / Career Highlights with 6-9 truthful bullets when experience exists.
- Include Professional Strengths / Value Proposition with 5-7 role-specific bullets or paragraphs.
- Include strong profile summary, core competencies, professional experience, selected achievements, education, certifications/training, technical skills/tools, projects/leadership where relevant, and referees on request.
- If information is missing, write "To be provided" and list what the user should supply.
- Do a final human CV writer review pass before returning the JSON, but do not summarize or shorten.
`;

const cases = [
  {
    id: "cv-revamp",
    name: "CV Revamp",
    instruction: `${cvStandard}
Revamp the existing CV into an ATS-optimized Public Service / NGO-ready professional CV. Keep facts truthful and make it feel worth paying for.`,
    payload: {
      cvMode: "Public Service CV",
      targetJobTitle: "Monitoring and Evaluation Officer",
      targetIndustry: "NGO and public sector development programmes in Kenya",
      yearsExperience: "6 years",
      improvementGoal: "ATS Optimization",
      jobAdvertText:
        "Monitoring and Evaluation Officer needed for donor-funded education and livelihoods programme. Responsibilities include indicator tracking, data collection tools, KoboToolbox, DHIS2, Excel dashboards, field visits, reporting, stakeholder coordination, data quality assessments, learning briefs, and compliance with donor reporting standards.",
      oldCvContent:
        "Timothy Sila Kamwilwa, Nairobi Kenya, timothy@example.com, 0723000000. Profile: M&E assistant with experience in projects. Work Experience: M&E Assistant, Community Action Programme, Jan 2020 to Present. Collected data from 12 field officers across Nairobi, Kiambu, Machakos and Kajiado. Maintained beneficiary records for education and livelihoods activities. Prepared monthly reports for programme managers and donor review meetings. Helped with baseline, midline and endline surveys using KoboToolbox and Excel. Supported data quality checks, cleaned duplicate entries, followed up missing forms, and prepared attendance summaries for trainings. Supported project meetings, learning sessions and stakeholder coordination with schools, youth groups and local administrators. Project Assistant, Youth Skills Initiative, Feb 2017 to Dec 2019. Organized vocational training sessions for youth beneficiaries. Registered participants, followed up attendance, prepared weekly updates and maintained training files. Supported logistics, venue preparation, facilitator communication, materials distribution and post-training feedback collection. Education: Bachelor of Arts in Development Studies, University of Nairobi, 2016. Skills: data collection, reporting, Excel, KoboToolbox, dashboard support, stakeholder coordination, communication, training coordination, field monitoring, data cleaning, report writing. Certificates: Monitoring and Evaluation short course, 2021. Referees available on request."
    }
  },
  {
    id: "cv-builder",
    name: "CV Builder",
    instruction: `${cvStandard}
Build a detailed ATS-optimized professional CV from the structured intake. Mode: Accounting/Admin CV. Target role: Accounts Assistant.`,
    payload: {
      cvMode: "Accounting/Admin CV",
      personalDetails: "Purity Wanjiku, Thika Kenya, purity@example.com, 0712000000, LinkedIn: linkedin.com/in/purity-wanjiku",
      targetJobTitle: "Accounts Assistant",
      industry: "SME finance, accounting, and administration",
      experienceLevel: "Entry to mid-level",
      jobAdvertText:
        "Accounts Assistant required to support invoice processing, reconciliations, petty cash, supplier payments, filing, KRA compliance, QuickBooks, Excel, payment follow-up, and monthly reports.",
      workExperience:
        "Accounts Intern, Bright Supplies Ltd, May 2023 to July 2024. Prepared invoices, updated payment records, followed up clients, supported bank reconciliations, filed receipts and delivery notes, assisted with petty cash, used Excel and QuickBooks. Processed about 120 invoices monthly, supported reconciliation of 3 bank and cash records, tracked more than 30 supplier accounts, and helped reduce missing receipt issues by keeping daily records updated. Administrative Assistant, Jirani Stores, Jan 2022 to Apr 2023. Handled customer records, prepared daily sales summaries, coordinated supplier calls, maintained filing, supported stock checks, updated stock movement records, prepared basic sales summaries for the owner, and followed up customer payment balances.",
      education: "Diploma in Business Management, Kenya Institute of Management, 2021. CPA Section 2 ongoing.",
      skills: "Excel, QuickBooks, invoicing, reconciliation, petty cash, filing, customer follow-up, supplier coordination, KRA iTax basics, communication.",
      certifications: "CPA Section 1 completed. QuickBooks short course.",
      projectsLeadership: "Helped reorganize supplier filing system and created Excel tracker for pending invoices.",
      referees: "Available on request."
    }
  },
  {
    id: "cover-letter",
    name: "Cover Letter",
    instruction:
      "Create a one-page, job-winning cover letter. It must be brief, smart, specific, confident, Kenyan professional tone, not generic. Around 430-520 words maximum. Use evidence and connect applicant to the role.",
    payload: {
      applicantName: "Purity Wanjiku",
      targetJobTitle: "Accounts Assistant",
      company: "Brightline Logistics Ltd",
      industry: "Logistics and SME finance operations",
      experienceSummary:
        "Entry to mid-level accounts/admin professional with hands-on experience in invoices, reconciliations, petty cash, supplier records, Excel, QuickBooks, filing, and client payment follow-up.",
      keyAchievements:
        "Created an Excel tracker for pending invoices, improved filing of supplier documents, supported monthly reconciliation preparation, and helped reduce missing receipt issues by keeping daily records updated.",
      jobAdvertText:
        "Accounts Assistant to support invoice processing, supplier payments, petty cash, reconciliations, QuickBooks, Excel reporting, filing, and communication with clients and vendors.",
      tone: "Professional, direct, confident"
    }
  }
];

function stripHtml(html) {
  return html
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|section|h1|h2|h3|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderMarkdown(result) {
  const body = result.sections
    .map((section) => `## ${section.title}\n\n${stripHtml(section.html)}`)
    .join("\n\n");
  return `# ${result.title}\n\n${body}\n\n## QA Scores\n\n${Object.entries(result.qualityScores || {})
    .filter(([, value]) => typeof value !== "object")
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n")}\n\n## ATS Keywords\n\n${(result.atsKeywords || []).join(", ")}\n\n## Improvements Made\n\n${(result.improvementsMade || []).map((item) => `- ${item}`).join("\n")}\n\n## Missing Information\n\n${(result.missingInformation || []).map((item) => `- ${item}`).join("\n")}\n`;
}

async function runCase(testCase) {
  let parsed;
  let usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
  let qualityFeedback = "";

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content:
            "You are SolvaOne's premium document generation QA engine for Kenya and East Africa. Produce truthful, polished, useful career documents. Never invent fake qualifications, dates, employers, certificates, or referees."
        },
        { role: "developer", content: `${testCase.instruction}\n\n${outputContract}` },
        {
          role: "user",
          content: `${JSON.stringify(testCase.payload, null, 2)}\n\n${qualityFeedback}`
        }
      ],
      temperature: attempt === 1 ? 0.25 : 0.18,
      max_output_tokens: testCase.id === "cover-letter" ? 6000 : 18000
    });

    usage = {
      input_tokens: usage.input_tokens + (response.usage?.input_tokens ?? 0),
      output_tokens: usage.output_tokens + (response.usage?.output_tokens ?? 0),
      total_tokens: usage.total_tokens + (response.usage?.total_tokens ?? 0)
    };

    const raw = response.output_text.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    parsed = JSON.parse(raw);
    const draftText = renderMarkdown(parsed);
    const words = draftText.split(/\s+/).filter(Boolean).length;
    const sections = parsed.sections?.length ?? 0;
    const bullets = (draftText.match(/\n- /g) || []).length;
    const needsCvDepth = testCase.id !== "cover-letter" && (words < 1100 || sections < 9 || bullets < 30);
    const needsCoverFocus = testCase.id === "cover-letter" && (words < 330 || words > 620);

    if (!needsCvDepth && !needsCoverFocus) break;

    qualityFeedback = [
      "QUALITY RETRY:",
      needsCvDepth ? `The CV is still too thin: ${words} words, ${sections} sections, ${bullets} bullets. Rewrite as a fuller premium CV with 1,100+ words, 9-12 sections, 30+ substantial bullets, richer role scope, stronger achievements, and useful To be provided prompts without fake facts.` : "",
      needsCoverFocus ? `The cover letter length is off: ${words} words. Rewrite as a focused one-page letter of 430-520 words.` : ""
    ].filter(Boolean).join("\n");
  }

  if (!parsed) throw new Error(`No output for ${testCase.name}`);

  if (testCase.id !== "cover-letter") {
    const review = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content:
            "You are a senior human CV writer. Polish the supplied JSON CV and return only the same JSON shape. Preserve truthfulness, improve depth, remove repetition, strengthen ATS alignment, and keep it unbranded. Do not summarize or shorten; preserve at least the same level of detail."
        },
        { role: "developer", content: outputContract },
        { role: "user", content: JSON.stringify({ payload: testCase.payload, draft: parsed }, null, 2) }
      ],
      temperature: 0.15,
      max_output_tokens: 18000
    });
    usage = {
      input_tokens: usage.input_tokens + (review.usage?.input_tokens ?? 0),
      output_tokens: usage.output_tokens + (review.usage?.output_tokens ?? 0),
      total_tokens: usage.total_tokens + (review.usage?.total_tokens ?? 0)
    };
    const raw = review.output_text.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    const reviewed = JSON.parse(raw);
    const reviewedWords = renderMarkdown(reviewed).split(/\s+/).filter(Boolean).length;
    const draftWords = renderMarkdown(parsed).split(/\s+/).filter(Boolean).length;
    parsed = reviewedWords >= draftWords ? reviewed : parsed;
  }

  return { parsed, usage };
}

const outDir = path.join(process.cwd(), "qa", "generated");
fs.mkdirSync(outDir, { recursive: true });

const summary = [];
for (const testCase of cases) {
  const { parsed, usage } = await runCase(testCase);
  const text = renderMarkdown(parsed);
  const file = path.join(outDir, `${testCase.id}.md`);
  fs.writeFileSync(file, text, "utf8");
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const bulletCount = (text.match(/\n- /g) || []).length;
  summary.push({
    case: testCase.name,
    file,
    sections: parsed.sections?.length ?? 0,
    wordCount,
    bulletCount,
    scores: parsed.qualityScores,
    usage
  });
}

fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
console.log(JSON.stringify(summary, null, 2));
