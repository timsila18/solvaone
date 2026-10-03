import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverableSubmission } from '../src/lib/job-desk/recovery-route.ts';
test('supported infrastructure holds recover, but uncertain sends and personal facts do not', () => {
  const app = {status:'needs_human',provider_response:{clicked:false},error_message:'Unsupported portal: use the prepared admin application packet.'};
  const vacancy = {application_method:'portal'};
  const source = {active:true,provider:'greenhouse'};
  assert.equal(recoverableSubmission(app,vacancy,source),true);
  assert.equal(recoverableSubmission({...app,provider_response:{clicked:true}},vacancy,source),false);
  assert.equal(recoverableSubmission({...app,error_message:'Missing factual answer: school grades'},vacancy,source),false);
  assert.equal(recoverableSubmission(app,vacancy,{active:true,provider:'ashby'}),false);
  assert.equal(recoverableSubmission(app,vacancy,{...source,active:false}),false);
});
