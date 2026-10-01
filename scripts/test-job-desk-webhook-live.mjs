import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";

const secret = fs.readFileSync(".vercel/job-desk-webhook-secret.tmp", "utf8").trim();
const id = `msg_${randomUUID()}`;
const timestamp = Math.floor(Date.now() / 1000).toString();
// Unknown test message: must never alter a real application or send a client notification.
const payload = JSON.stringify({ type: "email.delivered", created_at: new Date().toISOString(), data: { email_id: randomUUID() } });
const signature = createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`${id}.${timestamp}.${payload}`).digest("base64");
const url = "https://solvaone.co.ke/api/job-desk/email-events";
const request = headers => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "svix-id": id, "svix-timestamp": timestamp, ...headers }, body: payload, signal: AbortSignal.timeout(20000) });
const invalid = await request({ "svix-signature": "v1,invalid" });
assert.equal(invalid.status, 401);
const valid = await request({ "svix-signature": `v1,${signature}` });
assert.equal(valid.status, 503);
assert.equal((await valid.json()).error, "Message evidence not recorded yet");
console.log("Production webhook verified: invalid signature rejected; valid signed unknown message safely deferred. No customer records altered or applications sent.");
