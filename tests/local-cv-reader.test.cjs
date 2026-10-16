const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function load(relative, mocks = {}) {
  const filename = path.resolve(__dirname, "..", relative);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  instance.require = id => {
    if (/openai/i.test(id)) throw new Error("CV reader must never load an OpenAI client");
    return Object.hasOwn(mocks, id) ? mocks[id] : require(id);
  };
  instance._compile(code, filename);
  return instance.exports;
}

const { readLocalCvFields, readLocalCvSections } = load("src/lib/job-desk/local-cv-reader.ts");
const text = "Full Name: Test Candidate\nEmail: candidate@example.com\nMobile: +254 712 345 678\nlinkedin.com/in/test-candidate\nOffice administration, records management and customer support experience.\nReferences\nOther Person\nother@example.com\n+254 700 000 000";

test("local parser reads explicit contacts without guessing preferences", () => {
  const fields = readLocalCvFields(text);
  assert.equal(fields.fullName, "Test Candidate");
  assert.equal(fields.email, "candidate@example.com");
  assert.equal(fields.whatsappPhone, "+254 712 345 678");
  assert.equal(fields.applicantLinkedinUrl, "https://linkedin.com/in/test-candidate");
  assert.deepEqual(fields.targetJobTitles, []);
  assert.deepEqual(fields.preferredLocations, []);
  assert.equal(fields.currentCountry, "");
});

test("local parser does not substitute referee details or dates", () => {
  const fields = readLocalCvFields("Experience 2007-2015\nReferences\nreferee@example.com\n0712345678");
  assert.equal(fields.email, "");
  assert.equal(fields.whatsappPhone, "");
  assert.equal(readLocalCvFields("https://evil-linkedin.com/in/wrong").applicantLinkedinUrl, "");
});

const headedCv = `JANE EXAMPLE DOE
FINANCE | ACCOUNTING | PROCUREMENT
+254 712 345 678 / +254 700 000 000
jane@example.com
Nairobi, Kenya
PROFESSIONAL PROFILE
Finance professional with more than four years of progressive experience in reporting and reconciliations.
CORE COMPETENCIES
Financial Operations
Accounts payable, receivables, invoicing and payment support
ERP and Reporting
Odoo, Sage and QuickBooks
PROFESSIONAL EXPERIENCE
ACCOUNTANT AND PROCUREMENT OFFICER
Example Factory Limited | February 2025 - Present
Coordinate supplier payments and maintain accurate reports.
JUNIOR ACCOUNTS OFFICER
Example Manufacturing | October 2022 - January 2025
Supported sales reporting and order fulfilment.
EDUCATION AND TRAINING
Bachelor of Commerce in Finance | Example University
2018 - 2022
CERTIFICATIONS
Financial reporting certificate
LANGUAGES
English and Kiswahili
REFEREES
Other Person, Manager, referee@example.com, 0799999999`;

test("unlabelled CV headings fill name, city, country, job titles and documented experience", () => {
  const fields = readLocalCvFields(headedCv);
  assert.equal(fields.fullName, "JANE EXAMPLE DOE");
  assert.equal(fields.currentCity, "Nairobi");
  assert.equal(fields.currentCountry, "Kenya");
  assert.equal(fields.experienceLevel, "more than four years");
  assert.deepEqual(fields.targetJobTitles, ["ACCOUNTANT AND PROCUREMENT OFFICER", "JUNIOR ACCOUNTS OFFICER"]);
  assert.deepEqual(fields.preferredLocations, []);
  assert.equal(fields.email, "jane@example.com");
});

test("CV review retains duties, training, tools, languages and referees in sections", () => {
  const sections = readLocalCvSections(headedCv);
  assert.match(sections.summary, /more than four years/);
  assert.match(sections.skills, /Odoo, Sage and QuickBooks/);
  assert.match(sections.experience, /Coordinate supplier payments/);
  assert.match(sections.experience, /October 2022 - January 2025/);
  assert.match(sections.education, /Bachelor of Commerce/);
  assert.match(sections.education, /Financial reporting certificate/);
  assert.match(sections.additional, /English and Kiswahili/);
  assert.match(sections.additional, /referee@example.com/);
  assert.doesNotMatch(sections.experience, /referee@example.com/);
});

test("table-style joined roles, inline contacts and continued sections are recognized", () => {
  const fields = readLocalCvFields(`JANE EXAMPLE DOE\nJohannesburg, South Africa | 0810080308 | jane@example.com\nEXECUTIVE PROFILE\nSales professional with over 10 years of experience in territory support.\nPROFESSIONAL EXPERIENCE\nSALES REPRESENTATIVEExample Beverages Ltd\nJul 2026 - Present\nPromoted customer retention.\nPROFESSIONAL EXPERIENCE CONTINUED\nSALES SUPERVISOR\nExample Retail\n2021 - 2025\nEDUCATION\nDiploma in Business`);
  assert.equal(fields.currentCity, "Johannesburg");
  assert.equal(fields.currentCountry, "South Africa");
  assert.equal(fields.whatsappPhone, "0810080308");
  assert.equal(fields.experienceLevel, "over 10 years");
  assert.deepEqual(fields.targetJobTitles, ["SALES REPRESENTATIVE", "SALES SUPERVISOR"]);
});

test("only stated search preferences and availability are filled", () => {
  const fields = readLocalCvFields(`Jane Example Doe\nTarget roles: Finance Assistant; Accounts Officer\nPreferred locations: Nairobi; Kiambu\nPreferred industries: Banking; NGO\nWork arrangement: remote\nNotice period: 30 days\nPortfolio: www.example.com/work\nSummary: Office administration experience with accurate financial records.`);
  assert.deepEqual(fields.preferredLocations, ["Nairobi", "Kiambu"]);
  assert.deepEqual(fields.preferredIndustries, ["Banking", "NGO"]);
  assert.equal(fields.remotePreference, "remote");
  assert.equal(fields.noticePeriod, "30 days");
  assert.equal(fields.portfolioUrl, "https://www.example.com/work");
});

test("DOCX and TXT extraction works with all external services forbidden", async () => {
  const { Document, Paragraph, Packer } = require("docx");
  const { extractTextFromCvFile } = load("src/lib/cv-extraction.ts", {
    "@/lib/database-text": load("src/lib/database-text.ts"),
    "@/lib/supabase/admin": { createSupabaseAdminClient: () => { throw new Error("Unexpected database request"); } },
    "@/lib/hostafrica-private-storage": {}
  });
  const doc = new Document({ sections: [{ children: text.split("\n").map(line => new Paragraph(line)) }] });
  const bytes = await Packer.toBuffer(doc);
  const extracted = await extractTextFromCvFile("cv.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes);
  assert.ok(extracted.text.includes("candidate@example.com"));
  assert.equal(readLocalCvFields(extracted.text).fullName, "Test Candidate");
  assert.equal((await extractTextFromCvFile("cv.txt", "text/plain", Buffer.from(text))).text, text);
});

test("Word hard breaks and table columns preserve complete roles and education", async () => {
  const { Document, Paragraph, TextRun, Table, TableRow, TableCell, Packer } = require("docx");
  const { extractTextFromCvFile } = load("src/lib/cv-extraction.ts", {
    "@/lib/database-text": load("src/lib/database-text.ts"),
    "@/lib/supabase/admin": { createSupabaseAdminClient: () => { throw new Error("Unexpected database request"); } },
    "@/lib/hostafrica-private-storage": {}
  });
  const doc = new Document({ sections: [{ children: [
    new Paragraph("JANE EXAMPLE DOE"), new Paragraph("Nairobi, Kenya | jane@example.com | 0712345678"),
    new Paragraph("PROFESSIONAL EXPERIENCE"),
    new Table({ rows: [new TableRow({ children: [
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "TECHNICAL SUPPORT SPECIALIST", bold: true }), new TextRun({ text: "iExample Ltd", break: 1 })] })] }),
      new TableCell({ children: [new Paragraph("2021 - Present")] })
    ] })] }),
    new Paragraph("Maintained customer-support records and followed up requests."),
    new Paragraph("EDUCATION AND PROFESSIONAL TRAINING"), new Paragraph("Diploma in Business | Example College"),
    new Paragraph("SYSTEMS AND DIGITAL SKILLS"), new Paragraph("Excel | Sage | QuickBooks")
  ] }] });
  const source = await extractTextFromCvFile("table-cv.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", await Packer.toBuffer(doc));
  assert.match(source.text, /TECHNICAL SUPPORT SPECIALIST\niExample Ltd/);
  assert.deepEqual(readLocalCvFields(source.text).targetJobTitles, ["TECHNICAL SUPPORT SPECIALIST"]);
  assert.match(readLocalCvSections(source.text).education, /Diploma in Business/);
  assert.match(readLocalCvSections(source.text).skills, /QuickBooks/);
});

test("admin prefill endpoint returns zero API calls even in automatic AI mode", async () => {
  let audit;
  const { POST } = load("src/app/api/admin/job-desk/intake-preview/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/cv-extraction": { extractTextFromCvFile: async () => ({ text }) },
    "@/lib/job-desk/local-cv-reader": { readLocalCvFields, readLocalCvSections },
    "@/lib/security": { requireAdmin: async () => ({ allowed: true }), checkRateLimit: () => ({ allowed: true }), clientIpFromHeaders: () => "test", logAdminAction: async event => { audit = event; } },
    "@/lib/supabase/server": { getCurrentUser: async () => ({ id: "admin" }) }
  });
  const previous = process.env.JOB_DESK_AI_MODE;
  try {
    process.env.JOB_DESK_AI_MODE = "automatic";
    const form = new FormData();
    form.set("cvFile", new File([text], "cv.txt", { type: "text/plain" }));
    const response = await POST(new Request("http://localhost/api/admin/job-desk/intake-preview", { method: "POST", body: form }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.apiCalls, 0);
    assert.equal(result.mode, "local");
    assert.equal(result.fields.fullName, "Test Candidate");
    assert.equal(audit.details.estimatedCost, 0);
  } finally {
    if (previous === undefined) delete process.env.JOB_DESK_AI_MODE;
    else process.env.JOB_DESK_AI_MODE = previous;
  }
});
