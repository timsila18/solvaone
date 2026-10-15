const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const moduleRef = { exports: {} };
const source = fs.readFileSync("src/lib/database-text.ts", "utf8");
new Function("exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(moduleRef.exports);
const { databaseText } = moduleRef.exports;

test("removes NUL and unpaired surrogates but preserves ordinary Unicode", () => {
  assert.equal(databaseText("A\u0000B\ud800C\udfffD\ud83d\ude00"), "AB\ufffdC\ufffdD\ud83d\ude00");
});

test("both order-create routes clean form fields and extracted CV text", () => {
  for (const path of ["src/app/api/admin/job-desk/orders/route.ts", "src/app/api/job-desk/intake/route.ts"]) {
    const route = fs.readFileSync(path, "utf8");
    assert.match(route, /typeof value === "string" \? databaseText\(value\)/);
    assert.match(route, /file_name: databaseText\(/);
    assert.match(route, /extractedText = databaseText\(|text = databaseText\(/);
  }
});
