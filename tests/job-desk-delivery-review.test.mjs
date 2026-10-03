import test from 'node:test';
import assert from 'node:assert/strict';
import { zeroDeliveryReview } from '../src/lib/job-desk/delivery-review.ts';
import { createApplicationScope } from '../src/lib/job-desk/application-scope.ts';
const scope = createApplicationScope({targetRoles:'Sales',preferredLocations:'Kenya',remotePreference:'flexible',excludedEmployers:'',excludedRoles:'',excludedKeywords:'',channel:'admin_recorded',evidence:'Agreed scope'});
const order = {created_at:'2026-10-01T10:00:00Z',status:'active',payment_status:'paid',amount:1500,payment_reference:'Confirmed',application_authorized:true,service_details:{applicationScope:scope}};
test('paid zero-delivery clients become overdue and get an actionable next step',()=>{
  const result=zeroDeliveryReview(order,[],Date.parse('2026-10-03T10:00:00Z'));
  assert.equal(result.overdue,true); assert.equal(result.ageHours,48); assert.match(result.nextAction,/Refresh/);
});
test('provider acceptance is not delivery and must never encourage resending',()=>{
  assert.match(zeroDeliveryReview(order,[{status:'submitted',method:'email',provider_message_id:'accepted'}]).nextAction,/Do not resend/);
  assert.equal(zeroDeliveryReview(order,[{status:'submitted',method:'email',provider_response:{delivery:{event:'email.delivered'}}}]),null);
});
test('unpaid and deliberately paused orders do not escalate',()=>{
  assert.equal(zeroDeliveryReview({...order,payment_status:'pending'},[]),null);
  assert.equal(zeroDeliveryReview({...order,status:'paused'},[]),null);
});
