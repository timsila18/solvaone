const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const mod = { exports: {} };
new Function('exports', ts.transpileModule(fs.readFileSync('src/lib/job-desk/application-progress.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText)(mod.exports);

test('confirmed portals count without a suitability marker', () => {
  const applications = Array.from({ length: 10 }, (_, index) => ({
    match_id: `portal-${index}`, status: 'submitted', method: 'portal',
    provider_response: { confirmation: `receipt-${index}` }
  }));
  applications.push(...Array.from({ length: 3 }, (_, index) => ({
    match_id: `email-${index}`, status: 'submitted', method: 'email',
    provider_message_id: `provider-${index}`
  })));
  assert.deepEqual(mod.exports.applicationDeliveryCounts(applications), {
    delivered: 0, confirmed: 10, accepted: 3, processing: 0, blocked: 0
  });
});

test('duplicate attempts for one match do not inflate progress', () => {
  const application = { match_id: 'same-match', status: 'submitted', method: 'portal', provider_response: { confirmation: 'receipt' } };
  assert.equal(mod.exports.applicationDeliveryCounts([application, application]).confirmed, 1);
});

test('provider-accepted email is submitted while failed delivery is not', () => {
  const sent = { match_id: 'sent', status: 'submitted', method: 'email', provider_message_id: 'provider-1' };
  const bounced = { ...sent, match_id: 'bounced', provider_response: { delivery: { event: 'email.bounced' } } };
  assert.equal(mod.exports.successfulDelivery(sent), true);
  assert.equal(mod.exports.distinctSuccessfulDeliveries([sent, sent, bounced]), 1);
  assert.equal(mod.exports.applicationDeliveryCounts([sent, bounced]).accepted, 1);
  assert.equal(mod.exports.reportEvidence(sent).status, 'Submitted by email; delivery not confirmed');
});

test('submission sources distinguish agent evidence from admin records without guessing Codex attribution', () => {
  const applications = [
    { match_id: 'email', status: 'submitted', method: 'email', provider_message_id: 'id-1', provider_response: { verification_type: 'email_provider_accepted' } },
    { match_id: 'portal', status: 'submitted', method: 'portal', provider_response: { confirmation: 'receipt', verification_type: 'portal_confirmation' } },
    { match_id: 'manual', status: 'submitted', method: 'portal', provider_response: { confirmation: 'receipt', recorded_by: 'admin' } },
    { match_id: 'old', status: 'submitted', method: 'email', provider_message_id: 'id-2' },
    { match_id: 'bounced', status: 'submitted', method: 'email', provider_message_id: 'id-3', provider_response: { verification_type: 'email_provider_accepted', delivery: { event: 'email.bounced' } } }
  ];
  assert.deepEqual(mod.exports.submissionOriginCounts([...applications, applications[0]]), { agentEmail: 1, agentPortal: 1, adminRecorded: 1, unattributed: 1 });
});

test('admin-recorded sent email counts as submitted but not delivered', () => {
  const recorded = { match_id: 'gmail', status: 'submitted', method: 'email', provider_response: { confirmation: 'Gmail message ID', recorded_by: 'admin', verification_type: 'gmail_message_id' } };
  assert.equal(mod.exports.deliveryStage(recorded), 'accepted');
  assert.equal(mod.exports.distinctSuccessfulDeliveries([recorded]), 1);
  assert.equal(mod.exports.submissionOriginCounts([recorded]).adminRecorded, 1);
});
