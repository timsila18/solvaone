import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { allowedHandoffUrl, handoffCommands, createHandoffHandler } from './handoff.mjs';

test('handoff stays on the exact verified HTTPS board and accepts no arbitrary commands', () => {
  const application = { provider: 'lever', siteToken: 'fixture', url: 'https://jobs.lever.co/fixture/job/apply' };
  assert.equal(allowedHandoffUrl('https://jobs.lever.co/fixture/job/thanks', application), true);
  for (const url of ['http://jobs.lever.co/fixture/job', 'https://jobs.lever.co/other/job', 'https://jobs.lever.co.evil.invalid/fixture/job', 'https://user:password@jobs.lever.co/fixture/job', 'https://jobs.lever.co:444/fixture/job']) assert.equal(allowedHandoffUrl(url, application), false);
  assert.equal(allowedHandoffUrl('https://jobs.lever.co/fixture/another-job/thanks', application), false);
  for (const action of [{ action: 'eval', code: 'anything' }, { action: 'open', url: 'https://example.com' }, { action: 'click', x: -1, y: 2 }, { action: 'type', text: 'a'.repeat(2001) }, { action: 'key', key: 'F12' }]) assert.throws(() => handoffCommands(action));
  assert.deepEqual(handoffCommands({ action: 'click', x: 10, y: 20 })[0], ['mouse', 'move', '10', '20']);
});

test('human actions become non-retryable before browser input, and only an employer receipt counts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'solvaone-handoff-'));
  const id = '11111111-1111-4111-8111-111111111111';
  const dir = path.join(root, id);
  await fs.mkdir(dir);
  const job = { id, status: 'finished', result: { status: 'needs_human', clicked: false } };
  const jobs = new Map([[id, job]]);
  const marker = { session: id, expiresAt: new Date(Date.now() + 60000).toISOString() };
  await fs.writeFile(path.join(dir, 'handoff.json'), JSON.stringify(marker));
  await fs.writeFile(path.join(root, 'active-handoff.json'), JSON.stringify(marker));
  await fs.writeFile(path.join(dir, 'application.json'), JSON.stringify({ provider: 'lever', siteToken: 'fixture', approvedCvId: 'cv-fixture' }));
  let persisted = false;
  let receiptVisible = false;
  let closed = false;
  const handler = createHandoffHandler({ jobs, directory: () => dir, save: async record => { assert.equal(record.result.clicked, true); persisted = true; }, browserCommand: async (session, ...args) => {
    assert.equal(session, id);
    if (args[0] === 'get') return 'https://jobs.lever.co/fixture/job/apply';
    if (args[0] === 'keyboard') { assert.equal(persisted, true); return ''; }
    if (args[0] === 'screenshot') { await fs.writeFile(args[1], 'fixture-image'); return ''; }
    if (args[0] === 'eval') return JSON.stringify({ url: 'https://jobs.lever.co/fixture/job/thanks', body: receiptVisible ? 'Application submitted!' : 'Complete all required fields', submit: !receiptVisible });
    if (args[0] === 'close') { closed = true; return ''; }
    throw Error('Unexpected command');
  } });
  async function call(method, input) {
    const req = Readable.from(input ? [JSON.stringify(input)] : []);
    Object.assign(req, { method, url: `/applications/${id}/handoff`, headers: {} });
    let result;
    const res = { writeHead(status) { this.status = status; }, end(body) { result = { status: this.status, ...JSON.parse(body) }; } };
    assert.equal(await handler.handle(req, res), true);
    return result;
  }
  try {
    assert.equal((await call('GET')).approvedCvId, 'cv-fixture');
    assert.equal((await call('POST', { action: 'type', text: 'fixture text' })).status, 200);
    assert.equal(job.result.status, 'needs_human');
    assert.equal((await call('POST', { action: 'verify' })).receipt, undefined);
    receiptVisible = true;
    const result = await call('POST', { action: 'verify' });
    assert.equal(result.receipt.status, 'submitted');
    assert.equal(closed, true);
    assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'result.json'))).confirmation, 'Application submitted!');
    assert.equal((await call('POST', { action: 'verify' })).receipt.status, 'submitted');
    await assert.rejects(fs.access(path.join(root, 'active-handoff.json')));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('expired sessions never perform new browser actions', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'solvaone-expired-'));
  const id = '11111111-1111-4111-8111-111111111111';
  await fs.writeFile(path.join(root, 'handoff.json'), JSON.stringify({ session: id, expiresAt: new Date(0).toISOString() }));
  const handler = createHandoffHandler({ jobs: new Map([[id, { id }]]), directory: () => root, save: async () => {}, browserCommand: async (_, action) => { assert.equal(action, 'close'); } });
  try { await handler.cleanup(); await assert.rejects(fs.access(path.join(root, 'handoff.json'))); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
});
