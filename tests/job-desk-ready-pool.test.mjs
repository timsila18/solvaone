import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectRequirements, cachedReadiness, requirementsFingerprint, poolRank } from '../src/lib/job-desk/ready-pool.ts';
import { sourceDeliveryScore } from '../src/lib/job-desk/source-delivery.ts';

const vacancy = {id:'job',provider:'greenhouse',description:'A genuine advertised role',apply_url:'https://job-boards.greenhouse.io/example/jobs/123',application_method:'portal',email_verified:false,application_email:null};
const source = {active:true,provider:'greenhouse',site_token:'example'};
test('verified email is a simple route without claiming delivery', async () => {
  const result = await inspectRequirements({...vacancy,application_method:'email',email_verified:true,application_email:'jobs@example.com'});
  assert.equal(result.state,'ready');
  assert.equal((await inspectRequirements({...vacancy,application_method:'email'})).state,'assisted');
  assert.equal((await inspectRequirements({...vacancy,application_method:'email',email_verified:true,application_email:'jobs@example.com',description:'Applicants must complete the application form and an aptitude test.'})).state,'assisted');
});
test('requirement cache invalidates on route changes and expiry', () => {
  const readiness = {version:2,state:'ready',checkedAt:new Date().toISOString(),fingerprint:requirementsFingerprint(vacancy,source),blockers:[]};
  assert.ok(cachedReadiness({...vacancy,application_readiness:readiness},source));
  assert.equal(cachedReadiness({...vacancy,apply_url:vacancy.apply_url+'4',application_readiness:readiness},source),null);
  assert.equal(cachedReadiness({...vacancy,application_readiness:readiness},source,Date.now()+25*3600000),null);
  assert.ok(poolRank(readiness)>poolRank({...readiness,state:'assisted'}));
});
test('unsupported and employer no-AI routes stay assisted', async () => {
  assert.equal((await inspectRequirements(vacancy,{...source,provider:'ashby'})).state,'assisted');
  assert.equal((await inspectRequirements({...vacancy,description:'The use of AI content will disqualify your application.'},source)).state,'assisted');
});
test('public requirements checks use GET only and distinguish missing facts from simple forms', async () => {
  const original = globalThis.fetch;
  let questions = [{label:'First Name',required:true,fields:[{name:'first_name',type:'input_text'}]}];
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.method,undefined);
    assert.equal(options.body,undefined);
    return {ok:true,json:async()=>({questions})};
  };
  try {
    assert.equal((await inspectRequirements(vacancy,source)).state,'ready');
    questions = [{label:'What was your school grade?',required:true,fields:[{name:'question_1',type:'input_text'}]}];
    assert.equal((await inspectRequirements(vacancy,source)).state,'assisted');
    globalThis.fetch = async()=>{throw new Error('network');};
    assert.equal((await inspectRequirements(vacancy,source)).state,'deferred');
  } finally {globalThis.fetch=original;}
});
test('source scores count real evidence, not drafts or accepted emails', () => {
  const result = sourceDeliveryScore([
    {status:'submitted',method:'email',provider_message_id:'accepted'},
    {status:'submitted',method:'email',provider_response:{delivery:{event:'email.delivered'}}},
    {status:'submitted',method:'portal',provider_response:{confirmation:'receipt'}},
    {status:'needs_human'},
  ]);
  assert.deepEqual(result,{delivered:1,confirmed:1,accepted:1,blocked:1,priority:19});
});
