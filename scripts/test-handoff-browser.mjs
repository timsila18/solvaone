import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Readable } from 'node:stream';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// Isolated browser fixture: about:blank only, no employer, database or mail calls.
const modulePath = process.env.HANDOFF_TEST_MODULE || path.resolve('services/application-agent/handoff.mjs');
const { createHandoffHandler } = await import(pathToFileURL(modulePath).href);
const execute = promisify(execFile);
const id = randomUUID();
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'solvaone-browser-fixture-'));
const dir = path.join(root, id);
await fs.mkdir(dir);
const env = { PATH: process.env.PATH, HOME: process.env.HOME, PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH, AGENT_BROWSER_SESSION: id };
async function browser(...args) { return (await execute('agent-browser', args, { env, timeout: 30000, maxBuffer: 4 * 1024 * 1024 })).stdout.trim(); }
const job = { id, status: 'finished', result: { status: 'needs_human', clicked: false } };
const jobs = new Map([[id, job]]);
const fakeOrigin = 'https://jobs.lever.co/fixture/synthetic-job';
try {
  await browser('open', 'about:blank');
  await browser('set', 'viewport', '1000', '700');
  await browser('eval', `document.body.innerHTML = '<h1>Synthetic handoff fixture</h1><input aria-label="Fixture name" style="position:absolute;left:40px;top:60px;width:240px;height:40px"><button style="position:absolute;left:40px;top:160px;width:240px;height:40px" onclick="document.body.innerHTML=String.fromCharCode(65,112,112,108,105,99,97,116,105,111,110,32,115,117,98,109,105,116,116,101,100,33)">Submit application</button>'`);
  await fs.writeFile(path.join(dir, 'application.json'), JSON.stringify({ provider: 'lever', siteToken: 'fixture', url: fakeOrigin }));
  await fs.writeFile(path.join(dir, 'handoff.json'), JSON.stringify({ session: id, expiresAt: new Date(Date.now() + 60000).toISOString() }));
  const handler = createHandoffHandler({ jobs, directory: () => dir, save: async () => {}, browserCommand: async (_, ...args) => {
    if (args[0] === 'get') return fakeOrigin + '/apply';
    if (args[0] === 'eval') {
      let page = await browser(...args);
      for (let i = 0; i < 2 && typeof page === 'string'; i++) { try { page = JSON.parse(page); } catch { break; } }
      page.url = fakeOrigin + '/thanks';
      return JSON.stringify(page);
    }
    return browser(...args);
  } });
  async function call(action) {
    const req = Readable.from(action ? [JSON.stringify(action)] : []);
    Object.assign(req, { method: action ? 'POST' : 'GET', url: `/applications/${id}/handoff`, headers: {} });
    let result;
    const res = { writeHead(status) { this.status = status; }, end(body) { result = { status: this.status, ...JSON.parse(body) }; } };
    await handler.handle(req, res);
    assert.equal(result.status, 200, result.error);
    return result;
  }
  assert.match((await call()).image, /^data:image\/png;base64,/);
  await call({ action: 'click', x: 100, y: 80 });
  await call({ action: 'type', text: 'Synthetic candidate only' });
  assert.match(await browser('get', 'value', 'input'), /Synthetic candidate only/);
  assert.equal((await call({ action: 'verify' })).receipt, undefined);
  await call({ action: 'click', x: 100, y: 180 });
  assert.equal((await call({ action: 'verify' })).receipt.status, 'submitted');
  console.log('Actual Chromium screenshot, pointer input, typing and isolated receipt verification passed. No employer contacted or SolvaOne submission recorded.');
} finally {
  try { await browser('close'); } catch {}
  await fs.rm(root, { recursive: true, force: true });
}
