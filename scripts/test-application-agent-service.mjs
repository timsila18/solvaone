import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'solvaone-agent-test-'));
const token = 'test-only-secret-never-use-in-production-1234';
const port = 18749;
const endpoint = `http://127.0.0.1:${port}`;
const id = '11111111-1111-4111-8111-111111111111';
let child;
await fs.copyFile('services/application-agent/server.mjs', path.join(root, 'server.mjs'));
await fs.writeFile(path.join(root, 'runner.cjs'), 'console.log(JSON.stringify({status:"needs_human",clicked:false,reason:"TEST FIXTURE: no external browser or submission"}));');
async function start() {
  child = spawn(process.execPath, [path.join(root, 'server.mjs')], { env: { ...process.env, PORT: String(port), APPLICATION_AGENT_TOKEN: token, APPLICATION_AGENT_DATA_DIR: path.join(root, 'data') }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(endpoint + '/health')).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw Error('Test service did not start');
}
async function stop() { if (child && child.exitCode === null) { const closed = new Promise(r => child.once('exit', r)); child.kill(); await closed; } }
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const body = JSON.stringify({ data: { applicationId: id, provider: 'lever', siteToken: 'fixture', url: 'https://jobs.lever.co/fixture/example' }, cv: Buffer.from('fixture').toString('base64'), letter: Buffer.from('fixture').toString('base64') });
try {
  await start();
  assert.equal((await fetch(endpoint + '/applications/' + id)).status, 401);
  assert.equal((await fetch(endpoint + '/applications/' + id, { method: 'POST', headers, body: body.replace('jobs.lever.co', 'example.com') })).status, 400);
  assert.equal((await fetch(endpoint + '/applications/' + id, { method: 'POST', headers, body })).status, 202);
  let job;
  for (let i = 0; i < 40; i++) { job = await (await fetch(endpoint + '/applications/' + id, { headers })).json(); if (job.result) break; await new Promise(r => setTimeout(r, 100)); }
  assert.equal(job.result.clicked, false);
  const repeated = await (await fetch(endpoint + '/applications/' + id, { method: 'POST', headers, body })).json();
  assert.deepEqual(repeated, job);
  await stop(); await start();
  assert.deepEqual(await (await fetch(endpoint + '/applications/' + id, { headers })).json(), job);
  await stop();
  const interrupted = { id, status: 'running' };
  await fs.writeFile(path.join(root, 'data', id, 'state.json'), JSON.stringify(interrupted));
  await start();
  const recovered = await (await fetch(endpoint + '/applications/' + id, { headers })).json();
  assert.equal(recovered.result.status, 'needs_human');
  assert.equal(recovered.result.clicked, true);
  await stop();
  const confirmation = { status: 'submitted', clicked: true, confirmation: 'TEST FIXTURE employer receipt', finalUrl: 'https://jobs.lever.co/fixture/example' };
  await fs.writeFile(path.join(root, 'data', id, 'result.json'), JSON.stringify(confirmation));
  await fs.writeFile(path.join(root, 'data', id, 'state.json'), JSON.stringify(interrupted));
  await start();
  assert.deepEqual((await (await fetch(endpoint + '/applications/' + id, { headers })).json()).result, confirmation);
  console.log('Service authentication, host restrictions, idempotency, durable reconnect and interrupted-job recovery passed. No employer contacted.');
} finally { await stop(); await fs.rm(root, { recursive: true, force: true }); }
