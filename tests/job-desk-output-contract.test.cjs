const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { zodTextFormat } = require("openai/helpers/zod");

const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (id, ...rest) {
  return resolveFilename.call(this, id.startsWith("@/") ? path.resolve(__dirname, "../src", id.slice(2)) : id, ...rest);
};
require.extensions[".ts"] = function (module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  module._compile(code, filename);
};

const { jobDeskModelOutputSchema, jobDeskProcessingOutputSchema } = require("../src/lib/job-desk/types.ts");

test("Job Desk requests a strict, complete model response", () => {
  const format = zodTextFormat(jobDeskModelOutputSchema, "job_desk_cv");
  assert.equal(format.type, "json_schema");
  assert.equal(format.strict, true);

  function inspect(node) {
    if (!node || typeof node !== "object") return;
    assert.equal(Object.hasOwn(node, "default"), false);
    if (node.type === "object") {
      assert.equal(node.additionalProperties, false);
      assert.deepEqual(new Set(node.required), new Set(Object.keys(node.properties)));
    }
    for (const value of Object.values(node)) inspect(value);
  }
  inspect(format.schema);
});

test("Job Desk accepts a complete, evidence-based CV result", () => {
  const output = {
    candidateProfile: {
      fullName: "Candidate Name", email: "", phone: "", location: "",
      linkedIn: "", targetHeadline: "Engineer", professionalSummary: "Verified source summary",
      totalYearsExperience: "", skills: [], tools: [], industries: [],
      experience: [], education: [], certifications: [], languages: [], projects: [], leadership: []
    },
    profileCompleteness: 60,
    revampedCv: {
      title: "Candidate Name", executiveSummary: "A professional summary based on provided facts.",
      sections: [
        { id: "summary", title: "Professional Summary", html: "<p>A professional summary based on provided facts.</p>", improvementNotes: [] },
        { id: "skills", title: "Core Skills", html: "<p>Verified skills from the supplied CV.</p>", improvementNotes: [] }
      ],
      qualityScores: { completeness: 60, professionalTone: 80, structure: 80, ats: 75, achievementStrength: 50, recruiterReadability: 80, careerClarity: 75, notes: [] },
      improvementNotes: [], missingInformation: [], atsKeywords: [], improvementsMade: []
    },
    questionnaire: [], processingNotes: []
  };
  assert.equal(jobDeskProcessingOutputSchema.parse(output).revampedCv.sections.length, 2);
});
