import fs from "node:fs";
import postgres from "postgres";

const line = fs.readFileSync(".env.local", "utf8").split(/\r?\n/).find(entry => entry.startsWith("DIRECT_URL="));
if (!line) throw new Error("DIRECT_URL is required.");
const url = new URL(line.slice(11).trim().replace(/^"|"$/g, ""));
const db = postgres({ host: url.hostname, port: Number(url.port), database: "postgres", username: decodeURIComponent(url.username), password: decodeURIComponent(url.password).replace(/^\[|\]$/g, ""), ssl: "require", max: 1, connect_timeout: 10 });
try {
  console.log(JSON.stringify(await db`select jobname, schedule, active from cron.job where jobname = 'solvaone-job-desk-worker'`));
  console.log(JSON.stringify(await db`select exists(select 1 from vault.secrets where name = 'job_desk_cron_secret') as scheduler_secret_present`));
  console.log(JSON.stringify(await db`select status, return_message, start_time from cron.job_run_details where jobid in (select jobid from cron.job where jobname = 'solvaone-job-desk-worker') order by start_time desc limit 3`));
  console.log(JSON.stringify(await db`select status_code, timed_out, created from net._http_response order by created desc limit 3`));
} finally { await db.end(); }
