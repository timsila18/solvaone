import fs from "node:fs";
import postgres from "postgres";
import { revenueLedger, summarizeRevenue } from "../src/lib/admin/revenue.ts";

const line = fs.readFileSync(".env.local", "utf8").split(/\r?\n/).find(entry => entry.startsWith("DIRECT_URL="));
if (!line) throw new Error("DIRECT_URL is required.");
const url = new URL(line.slice(11).trim().replace(/^"|"$/g, ""));
const db = postgres({ host:url.hostname, port:Number(url.port), database:"postgres", username:decodeURIComponent(url.username), password:decodeURIComponent(url.password).replace(/^\[|\]$/g,""), ssl:"require", max:1 });
try {
  const payments = await db`select id,product,product_id,amount,status,created_at,paid_at,mpesa_receipt_number from payments`;
  const orders = await db`select id,service_type,amount,payment_status,payment_reference,created_at,paid_at from job_desk_orders`;
  const attempts = await db`select id,order_id,amount,status,created_at,updated_at,mpesa_receipt_number from job_desk_payment_attempts`;
  const iso = rows => rows.map(row => Object.fromEntries(Object.entries(row).map(([key,value]) => [key,value instanceof Date ? value.toISOString() : value])));
  const summary = summarizeRevenue(revenueLedger(iso(payments),iso(orders),iso(attempts)),{});
  console.log(JSON.stringify({revenue:summary.revenue,today:summary.revenueToday,month:summary.revenueMonth,adminRecorded:summary.adminRecorded,paidTransactions:summary.successful.length,failed:summary.failed,pending:summary.pending,byProduct:summary.byProduct}));
} finally { await db.end(); }
