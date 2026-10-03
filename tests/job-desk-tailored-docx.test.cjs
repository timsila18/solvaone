const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const mammoth = require("mammoth");
function load(relative) {
  const filename = path.resolve(__dirname, "..", relative);
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = module.paths;
  const original = instance.require.bind(instance);
  instance.require = name => name === "./cv-tailoring" ? load("src/lib/job-desk/cv-tailoring.ts") : name === "@/lib/solva-intelligence/types" ? load("src/lib/solva-intelligence/types.ts") : original(name);
  instance._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
  return instance.exports;
}
test("real DOCX attachment opens and retains facts with relevant skills first", async () => {
  const { createJobDeskCvDocx } = load("src/lib/job-desk/cv-docx.ts");
  const content = { title: "Candidate CV", executiveSummary: "Approved candidate with factual work history.", qualityScores: { completeness:80,professionalTone:80,structure:80 }, sections: [
    { id:"summary",title:"Profile",html:"<p>Approved factual profile summary.</p>" },
    { id:"skills",title:"Skills",html:"<ul><li>Stock monitoring</li><li>Payroll processing</li></ul>" },
    { id:"experience",title:"Experience",html:"<h3>2024 First Employer</h3><p>Verified responsibilities.</p><h3>2020 Earlier Employer</h3>" },
    { id:"education",title:"Education",html:"<p>Documented education only.</p>" }
  ] };
  const buffer = await createJobDeskCvDocx({ name:"Test Candidate",role:"Payroll Officer",contact:"candidate@example.com",content,vacancy:{title:"Payroll Officer",description:"Payroll processing."} });
  assert.equal(buffer.subarray(0,2).toString(),"PK");
  const {value} = await mammoth.extractRawText({buffer});
  assert.ok(value.indexOf("Payroll processing") < value.indexOf("Stock monitoring"));
  assert.ok(value.indexOf("2024 First Employer") < value.indexOf("2020 Earlier Employer"));
  assert.match(value,/Documented education only/);
});
