const fs = require('node:fs');
const ts = require('typescript');
const source = ts.createSourceFile('portal-browser.ts', fs.readFileSync('src/lib/job-desk/portal-browser.ts', 'utf8'), ts.ScriptTarget.Latest, true);
let runner;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'runner' && ts.isTaggedTemplateExpression(node.initializer)) runner = node.initializer.template.rawText;
  ts.forEachChild(node, visit);
}
visit(source);
if (!runner) throw Error('Browser runner not found');
fs.writeFileSync('services/application-agent/runner.cjs', runner);
