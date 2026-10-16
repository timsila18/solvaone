import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const locked = new Set();
export function allowedHandoffUrl(value, application) {
  try {
    const url = new URL(value);
    const hosts = application.provider === 'lever' ? ['jobs.lever.co'] : application.provider === 'greenhouse' ? ['boards.greenhouse.io', 'job-boards.greenhouse.io', 'job-boards.eu.greenhouse.io'] : [];
    const identity = value => new URL(value).pathname.replace(/\/(?:apply|thanks|thank_you|confirmation)\/?$/i, '').replace(/\/$/, '');
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') && hosts.includes(url.hostname) && url.pathname.split('/')[1]?.toLowerCase() === application.siteToken?.toLowerCase() && (!application.url || identity(url.href) === identity(application.url));
  } catch { return false; }
}

export function handoffCommands(input) {
  if (!input || typeof input !== 'object') throw Error('Invalid action.');
  if (input.action === 'click' && Number.isInteger(input.x) && Number.isInteger(input.y) && input.x >= 0 && input.y >= 0 && input.x <= 10000 && input.y <= 10000) return [['mouse', 'move', String(input.x), String(input.y)], ['mouse', 'down'], ['mouse', 'up']];
  if (input.action === 'type' && typeof input.text === 'string' && input.text.length > 0 && input.text.length <= 2000) return [['keyboard', 'inserttext', input.text]];
  if (input.action === 'key' && ['Tab', 'Enter', 'Backspace', 'Escape', 'ArrowDown', 'ArrowUp', 'Control+a'].includes(input.key)) return [['press', input.key]];
  if (input.action === 'scroll' && ['up', 'down'].includes(input.direction)) return [['scroll', input.direction, '500']];
  if (['verify', 'close', 'attach_cv', 'attach_letter'].includes(input.action)) return [];
  throw Error('Unsupported action.');
}

export function createHandoffHandler({ jobs, directory, save, browserCommand }) {
  async function browser(session, ...args) {
    if (browserCommand) return browserCommand(session, ...args);
    const { stdout } = await run('agent-browser', args, {
      timeout: 15000, maxBuffer: 8 * 1024 * 1024,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH, AGENT_BROWSER_SESSION: session },
    });
    return stdout.trim();
  }
  async function close(dir, marker) {
    try { await browser(marker.session, 'close'); } catch {}
    await fs.rm(path.join(dir, 'handoff.json'), { force: true });
    await fs.rm(path.join(dir, 'handoff.png'), { force: true });
    const lease = path.join(dir, '..', 'active-handoff.json');
    try { if (JSON.parse(await fs.readFile(lease, 'utf8')).session === marker.session) await fs.rm(lease); } catch {}
  }
  async function cleanup() {
    for (const job of jobs.values()) {
      if (locked.has(job.id)) continue;
      const dir = directory(job.id);
      try {
        const marker = JSON.parse(await fs.readFile(path.join(dir, 'handoff.json'), 'utf8'));
        if (Date.parse(marker.expiresAt) <= Date.now()) {
          if (locked.has(job.id)) continue;
          locked.add(job.id);
          try { await close(dir, marker); } finally { locked.delete(job.id); }
        }
      } catch {}
    }
  }
  return { cleanup, async handle(req, res) {
    if (req.url === '/handoff/status' && req.method === 'GET') {
      let marker;
      try { marker = JSON.parse(await fs.readFile(path.join(directory('00000000-0000-4000-8000-000000000000'), '..', 'active-handoff.json'), 'utf8')); } catch {}
      const occupied = marker && Date.parse(marker.expiresAt) > Date.now();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ available: !occupied, expiresAt: occupied ? marker.expiresAt : null }));
      return true;
    }
    const id = req.url?.match(/^\/applications\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/handoff$/i)?.[1];
    if (!id) return false;
    const reply = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); return true; };
    if (!['GET', 'POST'].includes(req.method)) return reply(405, { error: 'Method not allowed.' });
    const job = jobs.get(id);
    if (!job) return reply(404, { error: 'No saved application attempt.' });
    if (job.result?.status === 'submitted') return reply(200, { receipt: job.result });
    if (['queued', 'running'].includes(job.status) || locked.has(id)) return reply(409, { error: 'Browser is busy. Try again shortly.' });
    locked.add(id);
    try {
      const dir = directory(id);
      let marker;
      try { marker = JSON.parse(await fs.readFile(path.join(dir, 'handoff.json'), 'utf8')); } catch { return reply(410, { error: 'No retained browser session. Use the saved packet and review employer evidence; do not blindly resubmit.' }); }
      if (marker.session !== id || !Number.isFinite(Date.parse(marker.expiresAt))) return reply(410, { error: 'Session needs administrator review.' });
      if (Date.parse(marker.expiresAt) <= Date.now()) { await close(dir, marker); return reply(410, { error: 'Browser session expired. The application remains unconfirmed.' }); }
      const application = JSON.parse(await fs.readFile(path.join(dir, 'application.json'), 'utf8'));
      const url = (await browser(marker.session, 'get', 'url')).trim();
      if (!allowedHandoffUrl(url, application)) { await close(dir, marker); return reply(409, { error: 'Browser left the verified employer board. Review required.' }); }
      if (req.method === 'GET' && req.headers['x-handoff-metadata'] === '1') return reply(200, { url, expiresAt: marker.expiresAt, approvedCvId: application.approvedCvId, approvedCvFingerprint: application.approvedCvFingerprint });
      if (req.method === 'POST') {
        let body = '';
        for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 12000) return reply(413, { error: 'Action too large.' }); }
        const input = JSON.parse(body);
        const commands = handoffCommands(input);
        if (input.action === 'close') { await close(dir, marker); return reply(200, { closed: true }); }
        if (commands.length || ['attach_cv', 'attach_letter'].includes(input.action)) {
          // Any human input may trigger submission; make automatic retry unsafe first.
          job.result = { ...job.result, status: 'needs_human', clicked: true };
          await save(job);
          for (const args of commands) await browser(marker.session, ...args);
          if (input.action === 'attach_cv') await browser(marker.session, 'upload', 'input[type="file"][name*="resume"],input[type="file"][name*="cv"],input[type="file"][id*="resume"]', path.join(dir, 'cv.docx'));
          if (input.action === 'attach_letter') await browser(marker.session, 'upload', 'input[type="file"][name*="cover"],input[type="file"][id*="cover"]', path.join(dir, 'cover-letter.docx'));
        }
        if (input.action === 'verify') {
          let page = await browser(marker.session, 'eval', "JSON.stringify({url:location.href,body:document.body.innerText.slice(0,20000),submit:[...document.querySelectorAll('button,input[type=submit]')].some(e=>e.getClientRects().length&&/submit application/i.test(e.innerText||e.value||''))})");
          for (let i = 0; i < 2 && typeof page === 'string'; i++) { try { page = JSON.parse(page); } catch { break; } }
          const confirmation = typeof page?.body === 'string' ? page.body.match(/.{0,80}(?:thank you for applying|application (?:was |has been )?submitted|we (?:have )?received your application).{0,200}/i)?.[0] : null;
          if (confirmation && !page.submit && /\/(?:thanks|thank_you|confirmation)\/?$/i.test(new URL(page.url).pathname) && allowedHandoffUrl(page.url, application)) {
            const result = { status: 'submitted', clicked: true, confirmation, finalUrl: page.url };
            await fs.writeFile(path.join(dir, 'result.json'), JSON.stringify(result), { mode: 0o600 });
            job.result = result; job.status = 'finished'; await save(job);
            await close(dir, marker);
            return reply(200, { receipt: result });
          }
        }
      }
      const imagePath = path.join(dir, 'handoff.png');
      await browser(marker.session, 'screenshot', imagePath);
      const image = await fs.readFile(imagePath);
      if (image.length > 3 * 1024 * 1024) return reply(413, { error: 'Screenshot too large.' });
      return reply(200, { image: `data:image/png;base64,${image.toString('base64')}`, url, expiresAt: marker.expiresAt, approvedCvId: application.approvedCvId });
    } catch { return reply(400, { error: 'Browser action could not be completed. Refresh and check the saved outcome before retrying.' }); }
    finally { locked.delete(id); }
  } };
}
