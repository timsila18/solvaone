const origin = process.env.APPLICATION_AGENT_URL;
const token = process.env.APPLICATION_AGENT_TOKEN;
if (!origin || !token) throw Error('Set APPLICATION_AGENT_URL and APPLICATION_AGENT_TOKEN. Never put the token in a public variable.');
const url = new URL('/ready', origin);
if (url.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(url.hostname)) throw Error('Remote readiness checks require HTTPS.');
const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
console.log(JSON.stringify({ status: response.status, ...await response.json() }, null, 2));
if (!response.ok) process.exitCode = 1;
