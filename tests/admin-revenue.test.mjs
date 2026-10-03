import test from "node:test";
import assert from "node:assert/strict";
import { revenueLedger, summarizeRevenue, readAllRows } from "../src/lib/admin/revenue.ts";

test("Job Hunting receipts are counted once and manual records remain separate", () => {
  const created_at = "2026-10-01T12:00:00Z";
  const orders = [{ id:"o", service_type:"job_search_full", amount:1500, payment_status:"paid", created_at, paid_at:created_at, payment_reference:"ABC" }, { id:"m", service_type:"interview_coaching", amount:1000, payment_status:"paid", created_at, payment_reference:"Received" }];
  const attempts = [{ id:"a", order_id:"o", amount:1500, status:"successful", created_at, mpesa_receipt_number:"ABC" }, { id:"f", order_id:"o", amount:1500, status:"failed", created_at }];
  const rows = revenueLedger([],orders,attempts);
  const summary = summarizeRevenue(rows,{},new Date("2026-10-03T00:00:00Z"));
  assert.equal(summary.revenue,2500);
  assert.equal(summary.successful.length,2);
  assert.equal(summary.adminRecorded,1000);
  assert.equal(summary.failed,1);
  assert.equal(revenueLedger([{id:"p",product:"job_search_full",status:"successful",amount:1500,created_at,mpesa_receipt_number:"ABC"}],orders,attempts).filter(row=>row.status==="successful").length,2);
});

test("Nairobi dates use payment date; range and product filters work", () => {
  const rows = [{id:"p",product:"cv_revamp",status:"successful",amount:499,created_at:"2026-09-29T12:00:00Z",paid_at:"2026-09-30T22:00:00Z"}, {id:"q",product:"job_search_full",status:"successful",amount:1500,created_at:"2026-09-01T12:00:00Z"}];
  const s = summarizeRevenue(rows,{range:"today"},new Date("2026-10-01T10:00:00Z"));
  assert.equal(s.revenueMonth,499);
  assert.equal(s.revenueToday,499);
  assert.equal(s.filtered.length,1);
  assert.equal(s.revenue,1999);
  assert.equal(summarizeRevenue(rows,{range:"month",product:"job_search_full"},new Date("2026-10-01T10:00:00Z")).filtered.length,0);
});

test("pagination reads beyond API page limits and errors never become zero", async () => {
  const rows = await readAllRows(async from => ({data:Array.from({length:from===0?500:2},(_,i)=>({id:from+i})),error:null}));
  assert.equal(rows.length,502);
  await assert.rejects(readAllRows(async()=>({data:null,error:{message:"Denied"}})),/could not be loaded/);
});

test("unpaid, waived and zero-value orders are not sales; week starts Monday in Nairobi", () => {
  const created_at = "2026-09-28T08:00:00Z";
  const orders = ["unpaid","waived","paid"].map((payment_status,i)=>({id:String(i),service_type:"job_search_full",amount:payment_status==="paid"?0:1500,payment_status,created_at}));
  assert.equal(revenueLedger([],orders,[]).length,0);
  const rows = [{id:"a",product:"cv_revamp",status:"successful",amount:499,created_at}, {id:"b",product:"cv_revamp",status:"successful",amount:499,created_at:"2026-09-27T12:00:00Z"}];
  assert.equal(summarizeRevenue(rows,{range:"week"},new Date("2026-10-03T12:00:00Z")).successful.length,1);
});
