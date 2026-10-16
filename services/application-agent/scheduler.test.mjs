import test from 'node:test';
import assert from 'node:assert/strict';
import { schedulerConfig, tick } from './scheduler.mjs';
import fs from 'node:fs/promises';
import ts from 'typescript';

async function loadLocalModule(name) {
  const source = await fs.readFile(new URL(`../../src/lib/job-desk/${name}.ts`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
}

test('local letter adds no qualifications and is bound to the exact approved CV', async () => {
  const { localApplicationLetter } = await loadLocalModule('local-letter');
  const first = localApplicationLetter('Fixture Candidate', 'Coordinator', 'Fixture Employer', 'cv-1', '<p>Approved background</p>');
  assert.match(first.letter, /Coordinator at Fixture Employer/);
  assert.doesNotMatch(first.letter, /years|expert|degree|certified|proficient/i);
  assert.deepEqual(first, localApplicationLetter('Fixture Candidate', 'Coordinator', 'Fixture Employer', 'cv-1', '<p>Approved background</p>'));
  assert.notEqual(first.evidence, localApplicationLetter('Fixture Candidate', 'Coordinator', 'Fixture Employer', 'cv-2', '<p>Approved background</p>').evidence);
  assert.notEqual(first.evidence, localApplicationLetter('Fixture Candidate', 'Coordinator', 'Fixture Employer', 'cv-1', '<p>Changed background</p>').evidence);
});

test('pilot permits only local preparation and resume, never AI matching or CV processing', async () => {
  const { localPilotTask } = await loadLocalModule('worker-pilot');
  const previous = process.env.JOB_DESK_WORKER_PILOT_ORDER_IDS;
  const id = '00000000-0000-4000-8000-000000000001';
  try {
    process.env.JOB_DESK_WORKER_PILOT_ORDER_IDS = id;
    assert.equal(localPilotTask('prepare', id), true);
    assert.equal(localPilotTask('resume_assisted', id), true);
    for (const type of ['match', 'process_cv', 'draft_answers', 'review_matches']) assert.equal(localPilotTask(type, id), false);
    assert.equal(localPilotTask('prepare', 'other-order'), false);
  } finally {
    if (previous === undefined) delete process.env.JOB_DESK_WORKER_PILOT_ORDER_IDS;
    else process.env.JOB_DESK_WORKER_PILOT_ORDER_IDS = previous;
  }
});

test('pilot allowlist fails closed and caps enrollment at five distinct orders', async () => {
  const source = await fs.readFile(new URL('../../src/lib/job-desk/worker-pilot.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { workerPilotOrders } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  const id = '00000000-0000-4000-8000-000000000001';
  assert.deepEqual(workerPilotOrders(undefined), []);
  assert.deepEqual(workerPilotOrders(`${id}, ${id}`), [id]);
  assert.throws(() => workerPilotOrders('not-an-order'));
  const ids = Array.from({ length: 6 }, (_, index) => `00000000-0000-4000-8000-00000000000${index}`);
  assert.equal(workerPilotOrders(ids.slice(0, 5).join(',')).length, 5);
  assert.throws(() => workerPilotOrders(ids.join(',')));
});

test('accepts only a secure worker endpoint and bounded interval', () => {
  assert.equal(schedulerConfig({ JOB_DESK_WORKER_URL: 'https://solvaone.co.ke/api/job-desk/worker/pilot' }).interval, 60000);
  for (const url of ['http://solvaone.co.ke/api/job-desk/worker', 'https://user:secret@example.com/api/job-desk/worker', 'https://example.com/other', 'https://example.com/api/job-desk/worker?token=secret']) {
    assert.throws(() => schedulerConfig({ JOB_DESK_WORKER_URL: url }));
  }
  assert.throws(() => schedulerConfig({ JOB_DESK_WORKER_URL: 'https://example.com/api/job-desk/worker', JOB_DESK_WORKER_INTERVAL_MS: '1' }));
});

test('sends a narrow bearer credential without following redirects', async () => {
  let cancelled = false;
  const result = await tick('https://example.com/api/job-desk/worker/pilot', 'fixture-secret', async (url, options) => {
    assert.equal(url, 'https://example.com/api/job-desk/worker/pilot');
    assert.equal(options.headers.Authorization, 'Bearer fixture-secret');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    return { ok: true, status: 200, body: { cancel: async () => { cancelled = true; } } };
  });
  assert.deepEqual(result, { ok: true, status: 200 });
  assert.equal(cancelled, true);
});
