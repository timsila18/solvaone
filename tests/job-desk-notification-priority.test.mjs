import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { compareClientTasks, claimPrioritizedTask } from '../src/lib/job-desk/task-priority.ts';

test('client updates precede zero-delivery matching without changing chronological update order', () => {
  const make = (task_type, created_at) => ({ task_type, order_id: 'client', available_at: created_at, created_at });
  const tasks = [make('match', '2026-10-01'), make('notify_client', '2026-10-03'), make('notify_client', '2026-10-02')];
  tasks.sort((a,b) => compareClientTasks(a,b,new Map()));
  assert.deepEqual(tasks.map(x => x.task_type), ['notify_client','notify_client','match']);
  assert.equal(tasks[0].created_at, '2026-10-02');
});

test('dedicated notification query reaches beyond a matching backlog', async () => {
  const filters = [];
  const notification = { id: 'notification', task_type: 'notify_client', status: 'queued', attempts: 0, max_attempts: 5, available_at: '2026-10-01', created_at: '2026-10-01' };
  const db = { from() {
    let update = false, expired = false, lane = false;
    const q = { select(){return q}, eq(){return q}, lt(){expired=true;return q}, lte(){return q}, order(){return q}, limit(){return q}, in(field,values){ filters.push([field,values]); lane=values.includes('notify_client'); return q}, update(){update=true;return q}, maybeSingle(){return Promise.resolve({data: notification,error:null})}, then(resolve){return Promise.resolve({data: expired ? [] : lane ? [notification] : [],error:null}).then(resolve)} };
    return q;
  }};
  assert.equal((await claimPrioritizedTask(db,'worker')).id,'notification');
  assert.ok(filters.some(([field,values]) => field === 'task_type' && values.includes('notify_client')));
});

test('CV approval wakes the worker even for CV-only services', async () => {
  const source=await readFile(new URL('../src/app/api/admin/job-desk/orders/[orderId]/route.ts',import.meta.url),'utf8');
  assert.match(source, /queueClientUpdate\(orderId, "cv_approved", document.id\);\s+queued = true;/);
});
