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

const { readLocalCvFields } = load("src/lib/job-desk/local-cv-reader.ts");
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

test("admin prefill endpoint returns zero API calls even in automatic AI mode", async () => {
  let audit;
  const { POST } = load("src/app/api/admin/job-desk/intake-preview/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/cv-extraction": { extractTextFromCvFile: async () => ({ text }) },
    "@/lib/job-desk/local-cv-reader": { readLocalCvFields },
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
