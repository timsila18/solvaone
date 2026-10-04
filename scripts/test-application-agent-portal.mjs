import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const [input, cvPath, letterPath] = process.argv.slice(2);
if (!input || !cvPath || !letterPath) throw Error('Supply candidate JSON, CV DOCX and cover-letter DOCX paths. This command never submits.');
if (!process.env.APPLICATION_AGENT_URL || !process.env.APPLICATION_AGENT_TOKEN) throw Error('Configure the application agent first.');
const data = JSON.parse(await fs.readFile(input, 'utf8'));
data.applicationId = randomUUID(); data.dryRun = true;
const endpoint = new URL('/applications/' + data.applicationId, process.env.APPLICATION_AGENT_URL);
if (endpoint.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(endpoint.hostname)) throw Error('Remote tests require HTTPS.');
const headers = { Authorization: `Bearer ${process.env.APPLICATION_AGENT_TOKEN}`, 'Content-Type': 'application/json' };
const body = { data, cv: (await fs.readFile(cvPath)).toString('base64'), letter: (await fs.readFile(letterPath)).toString('base64') };
const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
if (!response.ok) throw Error('Test request rejected: ' + response.status);
console.log('Non-submitting test attempt: ' + data.applicationId);
for (let i = 0; i < 90; i++) {
  const poll = await fetch(endpoint, { headers, signal: AbortSignal.timeout(10000) });
  if (!poll.ok) throw Error('Test result unavailable: ' + poll.status);
  const job = await poll.json();
  if (job.result) {
    console.log(JSON.stringify(job.result, null, 2));
    if (job.result.clicked !== false || !job.result.testReady) process.exitCode = 1;
    break;
  }
  if (i === 89) { console.error('Test timed out; retrieve the existing attempt ID.'); process.exitCode = 1; }
  else await new Promise(resolve => setTimeout(resolve, 2000));
}
