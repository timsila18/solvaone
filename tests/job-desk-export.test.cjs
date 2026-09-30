const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const pdfParse = require("pdf-parse/lib/pdf-parse.js");
const mammoth = require("mammoth");

const source = {
  title: "Candidate Name CV",
  executiveSummary: "A verified professional summary based on source material.",
  qualityScores: { completeness: 85, professionalTone: 90, structure: 90 },
  sections: ["Professional Summary", "Core Skills", "Professional Experience", "Education", "Projects"].map((title, index) => ({
    id: `section-${index}`, title,
    html: `<p>${title} based on documented experience and qualifications.</p><ul><li>Delivered work within a verified scope.</li></ul>`
  }))
};

const db = {
  from(table) {
    const data = table === "job_desk_orders"
      ? { id: "test-order", client_id: "test-client", client: { full_name: "Candidate Name", email: "candidate@example.com", whatsapp_phone: "+254700000000" } }
      : table === "job_desk_documents"
        ? { id: "test-cv", status: "review", structured_content: source }
        : { structured_profile: { targetHeadline: "Engineer", location: "Nairobi" } };
    const query = {
      select() { return query; }, eq() { return query; }, in() { return query; }, order() { return query; }, limit() { return query; },
      async single() { return { data, error: null }; },
      async maybeSingle() { return { data, error: null }; }
    };
    return query;
  }
};

const load = Module._load;
const resolveFilename = Module._resolveFilename;
Module._load = function (request, parent, isMain) {
  if (request === "@/lib/security") return { requireAdmin: async () => ({ allowed: true }) };
  if (request === "@/lib/supabase/admin") return { createSupabaseAdminClient: () => db };
  if (request === "@/lib/supabase/server") return { getCurrentUser: async () => ({ id: "admin" }) };
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

const { GET } = require("../src/app/api/admin/job-desk/orders/[orderId]/download/route.tsx");

for (const format of ["pdf", "docx"]) {
  test(`Job Desk renders a usable ${format.toUpperCase()} CV`, async () => {
    const request = { nextUrl: new URL(`https://solvaone.co.ke/api/admin/job-desk/orders/test-order/download?format=${format}`) };
    const response = await GET(request, { params: Promise.resolve({ orderId: "test-order" }) });
    assert.equal(response.status, 200);
    const file = Buffer.from(await response.arrayBuffer());
    assert.ok(file.length > 1000);
    if (format === "pdf") {
      assert.equal(file.subarray(0, 4).toString(), "%PDF");
      const parsed = await pdfParse(file);
      assert.match(parsed.text, /Candidate Name/);
      assert.match(parsed.text, /Professional Experience/);
      assert.doesNotMatch(parsed.text, /SolvaOne/);
    } else {
      assert.equal(file.subarray(0, 2).toString(), "PK");
      const parsed = await mammoth.extractRawText({ buffer: file });
      assert.match(parsed.value, /Candidate Name/);
      assert.match(parsed.value, /Professional Experience/);
      assert.doesNotMatch(parsed.value, /SolvaOne/);
    }
  });
}
