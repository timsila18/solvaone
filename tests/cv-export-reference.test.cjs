const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const JSZip = require("jszip");
const pdfParse = require("pdf-parse/lib/pdf-parse.js");
const mammoth = require("mammoth");

const document = {
  id: "cv-test", user_id: "user-test", project_id: "project-test",
  title: "Candidate Name - Operations Manager CV",
  projects: { product: "cv_revamp" },
  html: `<h1>Candidate Name</h1><h2>Contact Details</h2><p>Candidate Name<br>Email: candidate@example.com<br>Phone: +254700000000<br>Location: Nairobi</p><h2>Professional Profile</h2><p>Operations manager with verified delivery experience.</p><h2>Core Skills</h2><p>Project coordination | Client support</p><h2>Professional Experience</h2><p>Operations Manager | Example Company | 2022 - Present</p><ul><li>Coordinated projects and client onboarding.</li></ul><h2>Education</h2><p>Verified qualification</p>`
};

const load = Module._load;
const resolveFilename = Module._resolveFilename;
Module._load = function (request, parent, isMain) {
  if (request === "@/lib/payments") return { userHasPaidProject: async () => true };
  if (request === "@/lib/supabase/server") return {
    getCurrentUser: async () => ({ id: "user-test" }),
    createSupabaseServerClient: async () => ({ from: () => ({
      select() { return this; }, eq() { return this; },
      async single() { return { data: document, error: null }; }
    }) })
  };
  return load.call(this, request, parent, isMain);
};
Module._resolveFilename = function (id, ...rest) {
  return resolveFilename.call(this, id.startsWith("@/") ? path.resolve(__dirname, "../src", id.slice(2)) : id, ...rest);
};
require.extensions[".ts"] = require.extensions[".tsx"] = function (module, filename) {
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  module._compile(code, filename);
};

const { GET } = require("../src/app/api/documents/export/route.tsx");

for (const format of ["pdf", "docx"]) {
  test(`Customer CV ${format.toUpperCase()} is readable and unbranded`, async () => {
    const request = { nextUrl: new URL(`https://solvaone.co.ke/api/documents/export?documentId=cv-test&format=${format}`) };
    const response = await GET(request);
    assert.equal(response.status, 200);
    const file = Buffer.from(await response.arrayBuffer());
    assert.ok(file.length > 1000);
    if (format === "pdf") {
      assert.equal(file.subarray(0, 4).toString(), "%PDF");
      const parsed = await pdfParse(file);
      assert.match(parsed.text, /Candidate Name/);
      assert.match(parsed.text, /Professional Experience/i);
      assert.doesNotMatch(parsed.text, /SolvaOne|Revamped Professional CV/i);
    } else {
      assert.equal(file.subarray(0, 2).toString(), "PK");
      const parsed = await mammoth.extractRawText({ buffer: file });
      assert.match(parsed.value, /Candidate Name/);
      assert.match(parsed.value, /Professional Experience/i);
      assert.doesNotMatch(parsed.value, /SolvaOne|Revamped Professional CV/i);
      const xml = await (await JSZip.loadAsync(file)).file("word/document.xml").async("string");
      assert.match(xml, /w:sz w:val="32"/);
      assert.match(xml, /w:sz w:val="24"/);
      assert.doesNotMatch(xml, /w:color w:val="0066FF"/);
    }
  });
}

test("CV export never presents the workflow label as a job title", async () => {
  const original = document.title;
  try {
    for (const title of ["Revamped CV - Candidate Name", "CV Revamp - Candidate Name"]) {
      document.title = title;
      const request = { nextUrl: new URL("https://solvaone.co.ke/api/documents/export?documentId=cv-test&format=pdf") };
      const response = await GET(request);
      const parsed = await pdfParse(Buffer.from(await response.arrayBuffer()));
      assert.doesNotMatch(parsed.text, /CV Revamp|Revamped CV|^Revamp$/m);
    }
  } finally {
    document.title = original;
  }
});
