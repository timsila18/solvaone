import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

const token = process.env.APPLICATION_AGENT_TOKEN;
if (!token || token.length < 32) throw Error('Set a unique APPLICATION_AGENT_TOKEN of at least 32 characters.');
const root = path.resolve(process.env.APPLICATION_AGENT_DATA_DIR || '/data');
await fs.mkdir(root, { recursive: true, mode: 0o700 });
const jobs = new Map();
let busy = false;
async function save(job) {
  const dir = path.join(root, job.id);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(dir, 'state.tmp'), JSON.stringify(job), { mode: 0o600 });
  await fs.rename(path.join(dir, 'state.tmp'), path.join(dir, 'state.json'));
  jobs.set(job.id, job);
}
for (const entry of await fs.readdir(root)) {
  if (!/^[a-f0-9-]{36}$/i.test(entry)) continue;
  let job;
  try { job = JSON.parse(await fs.readFile(path.join(root, entry, 'state.json'), 'utf8')); }
  catch { job = { id: entry, status: 'finished', result: { status: 'needs_human', clicked: true, reason: 'Attempt ledger is unreadable. Reconcile before retrying.' } }; }
  if (job.status === 'running') { job.status = 'finished'; job.result = { status: 'needs_human', clicked: true, reason: 'Agent restarted during application. Check employer evidence before any retry.' }; await save(job); }
  jobs.set(job.id, job);
}
async function execute(job) {
  busy = true;
  try {
    job.status = 'running'; await save(job);
    const dir = path.join(root, job.id);
    const childEnv = { ...process.env, APPLICATION_WORKDIR: dir, AGENT_BROWSER_SESSION: job.id };
    delete childEnv.APPLICATION_AGENT_TOKEN;
    const child = spawn(process.execPath, [path.join(import.meta.dirname, 'runner.cjs')], { env: childEnv, stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    child.stdout.on('data', chunk => { output = (output + chunk.toString()).slice(-65536); });
    const timer = setTimeout(() => child.kill('SIGKILL'), 150000);
    try { await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); }); }
    finally { clearTimeout(timer); }
    const result = JSON.parse(output.trim().split('\n').at(-1));
    job.result = result.status === 'submitted' && result.confirmation && result.clicked === true ? result : { status: 'needs_human', reason: result.reason || 'No employer confirmation.', clicked: result.clicked !== false, testReady: result.testReady === true && result.clicked === false, finalUrl: result.finalUrl };
  } catch { job.result = { status: 'needs_human', clicked: true, reason: 'Agent execution ended without a verifiable result. Do not automatically resubmit.' }; }
  finally { job.status = 'finished'; await save(job); busy = false; }
}
setInterval(() => { if (!busy) { const job = [...jobs.values()].find(j => j.status === 'queued'); if (job) execute(job).catch(() => { busy = false; }); } }, 500);
function reply(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
const creating = new Set();
http.createServer(async (req, res) => {
  try {
    if (req.url === '/health' && req.method === 'GET') return reply(res, 200, { ok: true });
    const supplied = Buffer.from(req.headers.authorization || ''); const expected = Buffer.from(`Bearer ${token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return reply(res, 401, { error: 'Unauthorized' });
    if (req.url === '/ready' && req.method === 'GET') {
      const browser = spawnSync('agent-browser', ['--version'], { timeout: 10000, encoding: 'utf8' });
      const runner = await fs.access(path.join(import.meta.dirname, 'runner.cjs')).then(() => true, () => false);
      return reply(res, browser.status === 0 && runner ? 200 : 503, { ready: browser.status === 0 && runner, runner, browserAvailable: browser.status === 0, active: busy, queued: [...jobs.values()].filter(j => j.status === 'queued').length });
    }
    const id = req.url?.match(/^\/applications\/([a-f0-9-]{36})$/i)?.[1];
    if (!id) return reply(res, 404, { error: 'Not found' });
    if (req.method === 'GET') return reply(res, jobs.has(id) ? 200 : 404, jobs.get(id) || { error: 'Not found' });
    if (req.method !== 'POST') return reply(res, 405, { error: 'Method not allowed' });
    if (jobs.has(id)) return reply(res, 200, jobs.get(id));
    if (creating.has(id)) return reply(res, 409, { error: 'Creation in progress; reconcile before retrying' });
    if ([...jobs.values()].filter(j => j.status !== 'finished').length >= 100) return reply(res, 503, { error: 'Queue full' });
    creating.add(id);
    try {
      let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 12 * 1024 * 1024) return reply(res, 413, { error: 'Request too large' }); }
      const { data, cv, letter } = JSON.parse(body);
      const url = new URL(data.url);
      const hosts = data.provider === 'lever' ? ['jobs.lever.co'] : data.provider === 'greenhouse' ? ['boards.greenhouse.io', 'job-boards.greenhouse.io', 'job-boards.eu.greenhouse.io'] : [];
      if (data.applicationId !== id || url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !hosts.includes(url.hostname) || url.pathname.split('/')[1]?.toLowerCase() !== data.siteToken?.toLowerCase() || typeof cv !== 'string' || typeof letter !== 'string' || !cv || !letter || (data.dryRun !== undefined && typeof data.dryRun !== 'boolean')) return reply(res, 400, { error: 'Unsupported application' });
      const dir = path.join(root, id); await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      await fs.writeFile(path.join(dir, 'application.json'), JSON.stringify(data), { mode: 0o600 });
      await fs.writeFile(path.join(dir, 'cv.docx'), Buffer.from(cv, 'base64'), { mode: 0o600 });
      await fs.writeFile(path.join(dir, 'cover-letter.docx'), Buffer.from(letter, 'base64'), { mode: 0o600 });
      const job = { id, status: 'queued', createdAt: new Date().toISOString() }; await save(job); return reply(res, 202, job);
    } finally { creating.delete(id); }
  } catch { reply(res, 400, { error: 'Invalid request or storage unavailable' }); }
}).listen(Number(process.env.PORT || 8080), '0.0.0.0');
