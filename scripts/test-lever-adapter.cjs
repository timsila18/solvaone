const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const vm = require("node:vm");
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = new Module(file, module);
  mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file));
  const original = mod.require.bind(mod);
  mod.require = id => id.startsWith("./") ? load(path.resolve(path.dirname(file), `${id}.ts`)) : original(id);
  cache.set(file, mod);
  mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
  return mod.exports;
}
const { leverFormPreflight, leverPreflight } = load("src/lib/job-desk/lever-preflight.ts");
const simple = '<form id="application-form"><li><span class="application-label">Resume ✱</span><input type="file" name="resume"></li><li><span class="application-label">Full name ✱</span><input name="name" required></li><li><span class="application-label">Email ✱</span><input type="email" name="email" required></li></form>';
const known = { first_name: "Jane", last_name: "Candidate", email: "jane@example.com" };
assert.equal(leverFormPreflight(simple, "", known).ready, true);
assert.equal(leverFormPreflight(simple, "", known).fieldAnswers.name, "Jane Candidate");
for (const extra of ['<li><span class="application-label">Passport ✱</span><input name="passport" required></li>', '<li><span class="application-label">Privacy consent ✱</span><input type="checkbox" name="consent" required></li>', '<li><span class="application-label">Location ✱</span><input name="location" required></li>', '<div class="h-captcha"></div>']) {
  assert.equal(leverFormPreflight(simple.replace('</form>', extra + '</form>'), "", known).ready, false);
}
assert.equal(leverFormPreflight('<html>No form</html>', "", known).ready, false);
const runner = fs.readFileSync("src/lib/job-desk/portal-browser.ts", "utf8").match(/const runner = String.raw`([\s\S]*?)`;/)[1];
function runBrowser({ provider = "lever", challenge = false, missing = false, confirmation = true, outside = false } = {}) {
  let clicked = false, result, opened;
  const url = provider === "lever" ? "https://jobs.lever.co/example/11111111-1111-4111-8111-111111111111" : "https://job-boards.greenhouse.io/example/jobs/123";
  const fields = [{ tag: "INPUT", type: "file", name: "resume", label: "CV", required: true }, { tag: "INPUT", type: "text", name: provider === "lever" ? "name" : "first_name", label: "Name", required: true }];
  if (missing) fields.push({ tag: "TEXTAREA", type: "textarea", name: "unknown", label: "Real example", required: true });
  const data = { provider, url, siteToken: "example", firstName: "Jane", lastName: "Candidate", email: known.email, phone: "test" };
  vm.runInNewContext(runner, {
    URL, console: { log: value => { result = JSON.parse(value); } },
    require: id => id === "node:fs" ? { readFileSync: () => JSON.stringify(data) } : {
      execFileSync: (_cmd, args) => {
        if (args[0] === "open") opened = args[1];
        if (args[0] === "find") clicked = true;
        if (args[0] !== "eval") return "";
        const expr = args[1];
        if (expr.includes("{url:location.href")) return JSON.stringify({ url: outside ? "https://attacker.example/" : opened, body: clicked && confirmation ? "Thank you for applying" : "Apply", challenge, fields });
        if (expr.includes("filter(e=>e.checked")) return "[]";
        if (expr.includes("filter(e=>e.getClientRects")) return JSON.stringify([{ id: "submit", type: "submit", text: "Submit application" }]);
        if (expr.includes(".some(e=>")) return clicked && confirmation ? "false" : "true";
        if (expr.includes('getAttribute("role")')) return "null";
        return "true";
      }
    }
  });
  return { result, clicked, opened };
}
for (const provider of ["lever", "greenhouse"]) {
  const complete = runBrowser({ provider });
  assert.equal(complete.result.status, "submitted");
  assert.equal(complete.clicked, true);
  if (provider === "lever") assert.match(complete.opened, /\/apply$/);
}
for (const option of [{ challenge: true }, { missing: true }, { outside: true }]) {
  const held = runBrowser(option); assert.equal(held.result.status, "needs_human"); assert.equal(held.clicked, false);
}
const uncertain = runBrowser({ confirmation: false });
assert.equal(uncertain.result.status, "needs_human"); assert.equal(uncertain.result.clicked, true);
async function main() {
  await assert.rejects(leverPreflight({ siteToken: "example", url: "https://attacker.example/", answers: "", known }), /Unverified/);
  if (process.argv.includes("--live")) {
    const result = await leverPreflight({ siteToken: "dlocal", url: "https://jobs.lever.co/dlocal/9a30f231-9e7d-42bf-afab-59ede687eb41", answers: "", known });
    assert.equal(result.ready, false);
    assert.ok(result.blockers.length > 0);
    console.log(`Live Lever form: ${result.blockers.length} missing requirements detected. Read-only.`);
  }
  console.log("Lever schema and simulated browser confirmation/hold tests passed. No real applications sent.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
