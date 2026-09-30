import fs from "node:fs";
import postgres from "postgres";

const line = fs.readFileSync(".env.local", "utf8").split(/\r?\n/).find((entry) => entry.startsWith("DIRECT_URL="));
if (!line) throw new Error("DIRECT_URL is required in .env.local");
const url = new URL(line.slice("DIRECT_URL=".length).trim().replace(/^"|"$/g, ""));
const db = postgres({ host: url.hostname, port: Number(url.port), database: "postgres", username: decodeURIComponent(url.username), password: decodeURIComponent(url.password).replace(/^\[|\]$/g, ""), ssl: "require", max: 1 });

try {
  await db.unsafe("create extension if not exists pg_cron");
  await db.unsafe("create extension if not exists pg_net with schema extensions");
  const command = `select net.http_get(url := 'https://solvaone.co.ke/api/job-desk/worker', headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'job_desk_cron_secret')))`;
  const [{ job_id: jobId }] = await db`select cron.schedule(${"solvaone-job-desk-worker"}, ${"*/5 * * * *"}, ${command}) as job_id`;
  const [request] = await db.unsafe(command);
  console.log(`Job Desk cron job ${jobId}; initial HTTP request ${request.http_get}`);
} finally {
  await db.end();
}
