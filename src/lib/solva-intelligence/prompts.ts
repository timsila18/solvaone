import type { GenerateDocumentInput, ProductPrompt } from "./types";
import { products } from "@/lib/types";

const outputContract = `
Return ONLY valid JSON with this shape:
{
  "title": "Document title",
  "executiveSummary": "Brief summary of the document quality and direction",
  "sections": [{"id":"section_id","title":"Section Title","html":"<p>Semantic HTML content...</p>","improvementNotes":["..."]}],
  "qualityScores": {"completeness":0-100,"professionalTone":0-100,"structure":0-100,"ats":0-100,"achievementStrength":0-100,"recruiterReadability":0-100,"careerClarity":0-100,"tenderReadiness":0-100,"businessClarity":0-100,"notes":["..."]},
  "improvementNotes": ["User-friendly improvement notes"],
  "missingInformation": ["Additional detail recommended before final submission: ..."],
  "atsKeywords": ["keyword"],
  "improvementsMade": ["..."]
}
Do not invent employers, qualifications, certifications, referees, licenses, revenue, awards, or dates. If important details are missing, place them in missingInformation and avoid putting raw "To be provided" placeholders inside the employer-facing CV except for referees when the user explicitly expects that convention.
Use semantic HTML only inside section html. No markdown. No scripts. No inline event handlers.
`;

const premiumCvDepthStandard = `
Premium CV depth standard:
- Start by reading cvQualityReport when present. Address every detected weak area inside the final CV or in missingInformation. Use the follow-up questions as private guidance for missingInformation when the user has not supplied enough detail.
- For full CV Builder and CV Revamp documents, target at least 3 full A4 pages of useful CV content in the exported PDF/DOCX.
- Balance the CV for 3-4 well-filled A4 pages. Avoid a final page that is less than roughly 55% occupied: move compact factual sections such as education, certifications, technical skills, and projects earlier where appropriate, merge compatible short sections, and omit unsupported or empty sections. Never repeat or pad content merely to fill a page.
- Do not pad with generic filler. Expand with role-relevant, truthful detail: stronger profile narrative, core competencies, keyword-rich skills, role scope, achievement-led bullets, selected projects, leadership/volunteer work, tools, compliance/regulatory exposure, and training.
- Never invent percentages, quantities, money saved, growth figures, turnaround improvements, client counts, team sizes, project counts, KPIs, or other measurable results. Use a number only when it appears in the customer's supplied information. Where no metric exists, express the contribution and business value qualitatively and record the missing evidence in missingInformation.
- Produce 9-12 CV sections where the user's information supports them. Do not create employer-facing sections named Application Strengthening Notes, Missing Evidence, Missing Information, Improvement Notes, or anything that reveals the CV is unfinished.
- Minimum useful depth for a paid CV: 1,500-2,200 words, 9-12 sections, and at least 30 substantial bullets where the user's background supports it.
- Professional Summary: 170-230 words, written as a polished executive-style profile without sounding inflated.
- Core Competencies / ATS Keywords: 24-36 role-aligned keywords grouped logically, not dumped randomly. If jobAdvertText is provided, extract the most important hard skills, soft skills, tools, credentials, sector terms, and responsibility phrases, then weave them naturally into the summary, skills, and experience.
- Professional Experience: for each role, include a 70-100 word scope paragraph plus 7-9 achievement/value bullets where enough information is provided. Every bullet should be 22-38 words and follow the premium formula: Action + Scope + Tool/Method + Result/Business Value. If the source CV is thin, rewrite duties into stronger truthful contribution statements and put missing measurable results in missingInformation metadata.
- Add Selected Achievements / Career Highlights as a separate section when experience exists, with 6-9 bullets drawn only from supplied facts. Do not place prompts for figures or unfinished notes in the visible CV.
- Add Professional Strengths or Value Proposition with 5-7 role-specific paragraphs/bullets explaining how the candidate works, communicates, solves problems, and adds value.
- Add Technical Skills, Professional Strengths, Certifications/Training, Education, Projects, Leadership/Volunteer Experience, and Referees only where relevant. Keep user-facing CV sections unbranded and ready to send to an employer.
- Contact details must be cleanly separated into individual lines or short paragraphs in the first section: name, phone, email, location, LinkedIn/portfolio if supplied. Do not merge contact details into one run-on sentence.
- The final CV sections should read like the finished document a candidate submits to a recruiter. Put improvement advice only in improvementNotes/missingInformation metadata, not as visible CV sections.
- Write for a premium A4 export whose body typography is Arial 12 pt, 1.15 line spacing, and justified alignment. Keep paragraphs and bullets naturally sized so pages remain balanced and readable without padding, repetition, cramped blocks, or awkward half-empty pages.
- Treat the output as final employer-facing copy: remove drafting language, internal notes, platform references, unexplained placeholders, and instructions to the candidate from visible sections. The customer should be able to download and submit it immediately.
- Support role-specific modes: Graduate CV, Professional CV, Executive CV, Technical CV, NGO CV, Public Service CV, International CV, Sales/Marketing CV, and Accounting/Admin CV. Adjust vocabulary, sections, and emphasis to the chosen mode.
- Before returning JSON, perform a Human CV Writer Review pass: improve clarity, seniority, confidence, grammar, impact, ATS structure, repetition, and unnecessary filler. The final output should be the polished version after this review, not the rough first draft.
- The CV must feel complete and worth paying for while remaining ATS-readable, clean, truthful, and recruiter-friendly.
`;

const baseSystem = `
You are the premium document generation engine for SolvaOne by Solva Business Group.
Brand promise: Create. Apply. Grow.
You create detailed, editable, professional documents for Kenya and East Africa.
The output must be recruiter-friendly, tender-ready, investor-readable, and practical where relevant.
Never produce generic short content. Never sound robotic. Never fabricate facts.
Do not mention that the document was generated by AI, SolvaOne, Solva Intelligence, or any document platform inside the user-facing document sections.
Treat the customer's supplied instructions, target role, tone, and document type as binding unless they conflict with truthfulness, safety, or professional document quality.
`;

function sharedPrompt(input: GenerateDocumentInput, instructions: string): ProductPrompt {
  return {
    system: baseSystem,
    developer: `${instructions}\n\n${outputContract}`,
    user: JSON.stringify(
      {
        product: products[input.product].title,
        title: input.title,
        mode: input.mode ?? "full_document",
        sectionId: input.sectionId,
        sectionHtml: input.sectionHtml,
        templateId: input.templateId,
        payload: input.payload
      },
      null,
      2
    )
  };
}

export function buildProductPrompt(input: GenerateDocumentInput): ProductPrompt {
  switch (input.product) {
    case "cv_builder":
      return sharedPrompt(
        input,
        `
Build a premium ATS-optimized detailed CV as the default arrangement. The CV must obey the customer's target job title, industry, experience level, preferred tone, and any extra instructions.
Use this default section order unless the customer clearly asks otherwise: Name and contact details, Target role headline, Professional summary, Core competencies / ATS keywords, Professional experience, Selected achievements or projects, Education, Certifications and training, Technical skills where relevant, Leadership / volunteer experience where provided, Referees.
Generate a strong professional summary, achievement-based work experience, improved job descriptions, role-aligned skills, ATS-friendly keywords, clean section structure, and Kenya/East Africa professional tone.
CV styles: Graduate CV, Professional CV, Executive CV, Technical CV, Government/Public Service CV. Even when a style is selected, keep the CV ATS-readable with clear text sections and no decorative clutter.
${premiumCvDepthStandard}
Convert duties into value-focused bullets without inventing employers, dates, metrics, qualifications, or certifications.
If information is missing, omit the unsupported employer-facing line where possible and list the missing items in missingInformation.
`
      );
    case "cv_revamp":
      return sharedPrompt(
        input,
        `
Revamp an existing CV from pasted/uploaded content into a premium ATS-optimized detailed CV by default. Obey the customer's target job title, target industry, years of experience, preferred CV style, improvement goal, tone, and extra instructions.
Use this default arrangement unless the customer clearly asks otherwise: Name and contact details, Target role headline, Professional summary, Core competencies / ATS keywords, Professional experience, Selected achievements or projects, Education, Certifications and training, Technical skills where relevant, Leadership / volunteer experience where provided, Referees.
Rewrite professionally, improve weak bullet points, convert duties into achievements where the user supplied enough context, improve grammar and structure, strengthen professional summary, add relevant keywords, remove clutter, and suggest missing sections.
Output must include: revamped CV, summary of improvements made, ATS keyword suggestions, and missing information recommendations.
Improvement goals include ATS Optimization, Executive Upgrade, Graduate Upgrade, Career Change, Public Sector Application, and International Application.
${premiumCvDepthStandard}
Produce a complete CV with professional summary, core skills, work experience, education/training, technical tools where relevant, certifications where provided, and referees where supplied or customary. Keep user-facing CV sections unbranded and employer-ready.
Do not preserve weak formatting from the original CV. Improve arrangement, spacing, wording, and hierarchy while keeping all facts faithful to the original content.
`
      );
    case "cover_letter":
      return sharedPrompt(
        input,
        `
Generate a customized, client-ready professional cover letter. Inputs may include applicant name, target job title, company, industry, experience summary, key achievements, optional job advert text, tone, and cover letter type.
Return the letter in clear sections: address_and_salutation, opening_paragraph, evidence_based_body, closing_paragraph.
Write a proper salutation, strong opening paragraph, two evidence-based body paragraphs, and confident closing. Align the applicant's experience to the specific role and organization. Use Kenyan professional tone unless the customer asks for another tone.
Do not write a generic template. Mention the target role and company/organization when provided. If the company is missing, use "Hiring Manager" and mark company-specific details as "To be provided".
The letter should be polished, editable, complete, and one-page friendly: usually 350-500 words unless the user asks for a longer version. Use paragraph HTML, not bullet-heavy formatting.
Quality expectation: completeness >= 88, professionalTone >= 90, structure >= 88.
`
      );
    case "company_profile":
      return sharedPrompt(
        input,
        `
Generate a premium, credible, tender-ready company profile for Kenyan SMEs, startups, consultancies, contractors, suppliers, cleaning companies, security firms, ICT businesses, restaurants, creative agencies, and service companies.
Output sections in this exact professional order: cover page content, company overview, background, vision, mission, core values, services/products, target clients, why choose us, team/management, experience/projects, compliance/certifications, contact information.
Each service should include a practical description of what the company offers and the value to the client. For tender readiness, include capability language, reliability, compliance posture, and delivery approach where the customer provided enough context.
Do not invent certifications, licenses, or past clients. Mark missing details as "To be provided".
Produce enough depth for tender review, with clear service descriptions and evidence placeholders where supporting details are missing. The tone must feel premium, credible, and usable in PDF/DOCX without sounding like a generic brochure.
Quality expectation: completeness >= 90, professionalTone >= 90, structure >= 90, tenderReadiness >= 88.
`
      );
    case "business_plan":
      return sharedPrompt(
        input,
        `
Generate a practical, detailed, investor-readable business plan for Kenyan SMEs and startups.
Output sections in this exact professional order: executive summary, business description, problem statement, proposed solution, products/services, business model, market analysis, target customers, competitor analysis, marketing and sales strategy, operations plan, management team, revenue model, risk analysis, financial plan, implementation roadmap, and conclusion.
Make the plan practical and execution-ready. Tie recommendations to the user's industry, location, products/services, target customers, pricing, revenue streams, competitors, operations, team, funding needs, and business stage.
Use realistic assumptions only from the user's input. If financial details are missing, mark them as "To be provided" and explain what is needed.
Include tables in semantic HTML where useful for startup costs, revenue streams, risks, or implementation roadmap. Do not fabricate exact revenue, profit, staff counts, market share, or funding amounts.
Keep the plan concise enough to return valid JSON, but substantial: at least 15 structured sections with practical Kenya/East Africa execution detail.
Quality expectation: completeness >= 90, professionalTone >= 88, structure >= 90, businessClarity >= 88.
`
      );
  }
}
