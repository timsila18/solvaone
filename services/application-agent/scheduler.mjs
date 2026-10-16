import fs from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export function schedulerConfig(env) {
  const url = new URL(env.JOB_DESK_WORKER_URL || '');
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/api/job-desk/worker/pilot' || url.search || url.hash) {
    throw Error('JOB_DESK_WORKER_URL must be the HTTPS Job Desk worker endpoint.');
  }
  const interval = Number(env.JOB_DESK_WORKER_INTERVAL_MS || 60000);
  if (!Number.isFinite(interval) || interval < 30000 || interval > 3600000) throw Error('Worker interval must be between 30 seconds and one hour.');
  return { url: url.href, interval };
}

export async function tick(url, token, request = fetch) {
  const response = await request(url, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(270000),
  });
  // Never log response bodies: they can contain applicant or provider details.
  await response.body?.cancel();
  return { ok: response.ok, status: response.status };
}

async function main() {
  const { url, interval } = schedulerConfig(process.env);
  const token = (await fs.readFile(process.env.JOB_DESK_WORKER_SECRET_FILE || '/run/secrets/worker_secret', 'utf8')).trim();
  if (token.length < 32) throw Error('Use a dedicated worker secret of at least 32 characters.');
  let stopping = false;
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { stopping = true; });
  let failures = 0;
  while (!stopping) {
    try {
      // Await each tick before scheduling another; a slow request never overlaps locally.
      const result = await tick(url, token);
      failures = result.ok ? 0 : failures + 1;
      console.log(JSON.stringify({ event: 'worker_tick', status: result.status, failures }));
    } catch {
      failures += 1;
      console.error(JSON.stringify({ event: 'worker_tick_failed', failures }));
    }
    if (!stopping) await delay(Math.min(3600000, interval * 2 ** Math.min(failures, 6)));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Scheduler configuration unavailable.'); process.exitCode = 1; });
}
