export async function agentReadiness() {
  const origin = process.env.APPLICATION_AGENT_URL;
  const tokens = [...new Set([process.env.APPLICATION_AGENT_TOKEN_NEXT, process.env.APPLICATION_AGENT_TOKEN].filter((token): token is string => Boolean(token)))];
  if (!origin || !tokens.length) return { ok: false, runtime: "not_configured", status: 0 };
  try {
    const url = new URL("/ready", origin);
    if (url.protocol !== "https:") return { ok: false, runtime: "insecure_endpoint", status: 0 };
    for (const token of tokens) {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (response.status === 401 && token !== tokens.at(-1)) continue;
      const body = await response.json().catch(() => ({}));
      return { ok: response.ok && body.ready === true && body.runner === true && body.browserAvailable === true, runtime: response.ok && body.ready === true ? "execution_ready" : "execution_unavailable", status: response.status, runner: body.runner === true, browserAvailable: body.browserAvailable === true, active: body.active === true, queued: typeof body.queued === "number" ? body.queued : null, uncertain: typeof body.uncertain === "number" ? body.uncertain : null };
    }
  } catch { /* Do not expose endpoint credentials or raw response bodies. */ }
  return { ok: false, runtime: "unreachable", status: 0 };
}

