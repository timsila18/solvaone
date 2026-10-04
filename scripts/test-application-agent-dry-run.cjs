const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.createSourceFile('portal-browser.ts', fs.readFileSync('src/lib/job-desk/portal-browser.ts', 'utf8'), ts.ScriptTarget.Latest, true);
let runner;
function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'runner') runner = node.initializer.template.rawText; ts.forEachChild(node, visit); }
visit(source);
const calls = [], logs = [];
const data = { dryRun: true, provider: 'lever', siteToken: 'fixture', url: 'https://jobs.lever.co/fixture/job', firstName: 'Test', lastName: 'Candidate', email: 'fixture@example.com', phone: '0000000000' };
const page = { url: data.url, body: 'Test application', challenge: false, fields: [{ name: 'resume', type: 'file', tag: 'INPUT', label: 'Resume', required: true }, { name: 'email', type: 'email', tag: 'INPUT', label: 'Email', required: true }] };
function cli(command, args) {
  calls.push(args);
  if (args[0] === 'eval') {
    const expression = args[1];
    if (expression.includes('body:document.body.innerText')) return JSON.stringify(page);
    if (expression.includes('filter(e=>e.checked')) return '[]';
    if (expression.includes('map(e=>({id:e.id,type:e.type,text:')) return JSON.stringify([{ id: 'submit', type: 'submit', text: 'Submit application' }]);
    throw Error('Unexpected fixture expression');
  }
  return '';
}
vm.runInNewContext(runner, { URL, process: { env: {} }, console: { log: value => logs.push(JSON.parse(value)) }, require: name => name === 'node:fs' ? { readFileSync: () => JSON.stringify(data) } : { execFileSync: cli } });
assert.equal(logs.at(-1).testReady, true);
assert.equal(logs.at(-1).clicked, false);
assert.ok(calls.some(args => args[0] === 'upload'));
assert.ok(calls.some(args => args[0] === 'fill'));
assert.ok(!calls.some(args => args.includes('click')));
console.log('Dry-run fills and attaches documents without clicking submission. No browser or employer contacted.');
