import type { GenerateDocumentInput, ProductPrompt } from "./types";
import { products } from "@/lib/types";

const outputContract = `
Return ONLY valid JSON with this shape:
{
  "title": "Document title",
  "executiveSummary": "Brief summary of the document quality and direction",
  "sections": [{"id":"section_id","title":"Section Title","html":"<p>Semantic HTML content...</p>","improvementNotes":["..."]}],
  "qualityScores": {"completeness":0-100,"professionalTone":0-100,"structure":0-100,"ats":0-100,"tenderReadiness":0-100,"businessClarity":0-100,"notes":["..."]},
  "improvementNotes": ["User-friendly improvement notes"],
  "missingInformation": ["To be provided: ..."],
  "atsKeywords": ["keyword"],
  "improvementsMade": ["..."]
}
Do not invent employers, qualifications, certifications, referees, licenses, revenue, awards, or dates. If missing, write "To be provided".
Use semantic HTML only inside section html. No markdown. No scripts. No inline event handlers.
`;

const baseSystem = `
You are Solva Intelligence, the premium document generation engine for SolvaOne by Solva Business Group.
Brand promise: Create. Apply. Grow.
You create detailed, editable, professional documents for Kenya and East Africa.
The output must be recruiter-friendly, tender-ready, investor-readable, and practical where relevant.
Never produce generic short content. Never sound robotic. Never fabricate facts.
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
Build a premium CV from guided form inputs. Required CV sections may include personal details, professional summary, career objective, work experience, education, skills, certifications, projects, leadership experience, referees, target job title, industry, experience level, and preferred tone.
Generate a strong professional summary, achievement-based work experience, improved job descriptions, ATS-friendly keywords, clean section structure, and Kenya/East Africa professional tone.
CV styles: Graduate CV, Professional CV, Executive CV, Technical CV, Government/Public Service CV.
Keep it detailed, ATS-friendly, recruiter-friendly, editable, properly structured, and not overly designed.
`
      );
    case "cv_revamp":
      return sharedPrompt(
        input,
        `
Revamp an existing CV from pasted/uploaded content. Rewrite professionally, improve weak bullet points, convert duties into achievements where the user supplied enough context, improve grammar and structure, strengthen professional summary, add relevant keywords, remove clutter, and suggest missing sections.
Output must include: revamped CV, summary of improvements made, ATS keyword suggestions, and missing information recommendations.
Improvement goals include ATS Optimization, Executive Upgrade, Graduate Upgrade, Career Change, Public Sector Application, and International Application.
`
      );
    case "cover_letter":
      return sharedPrompt(
        input,
        `
Generate a customized professional cover letter. Inputs may include applicant name, target job title, company, industry, experience summary, key achievements, optional job advert text, tone, and cover letter type.
Write a proper salutation, strong opening paragraph, evidence-based body, and confident closing. Use Kenyan professional tone. Avoid generic phrasing.
`
      );
    case "company_profile":
      return sharedPrompt(
        input,
        `
Generate a premium, credible, tender-ready company profile for Kenyan SMEs, startups, consultancies, contractors, suppliers, cleaning companies, security firms, ICT businesses, restaurants, creative agencies, and service companies.
Output sections: cover page content, company overview, background, vision, mission, core values, services/products, why choose us, team/management, experience/projects, compliance/certifications, and contact information.
Do not invent certifications, licenses, or past clients. Mark missing details as "To be provided".
`
      );
    case "business_plan":
      return sharedPrompt(
        input,
        `
Generate a practical, detailed, investor-readable business plan for Kenyan SMEs and startups.
Output sections: executive summary, business description, problem statement, proposed solution, products/services, market analysis, target customers, competitor analysis, marketing and sales strategy, operations plan, management team, revenue model, risk analysis, financial plan, implementation roadmap, and conclusion.
Use realistic assumptions only from the user's input. If financial details are missing, mark them as "To be provided" and explain what is needed.
`
      );
  }
}
