import type { PortalApplication, PortalResult } from "./portal-browser";

export function verifiedAgentResult(value: unknown): PortalResult {
  const result = value as Partial<PortalResult> | null;
  if (result?.status === "submitted" && result.clicked === true && typeof result.confirmation === "string" && result.confirmation.trim() && typeof result.finalUrl === "string") return result as PortalResult;
  return { status: "needs_human", clicked: result?.clicked !== false, testReady: result?.testReady === true && result.clicked === false, finalUrl: result?.finalUrl, reason: result?.reason ?? "The dedicated agent returned no verifiable confirmation. Do not resubmit until reviewed." };
}

export async function runDedicatedApplication(data: PortalApplication, cv: Buffer, letter: Buffer): Promise<PortalResult> {
  const url = new URL(process.env.APPLICATION_AGENT_URL!);
  if (url.protocol !== "https:" || !process.env.APPLICATION_AGENT_TOKEN || !data.applicationId) throw new Error("Dedicated application agent requires HTTPS, a token and a stable application ID.");
  const headers = { Authorization: `Bearer ${process.env.APPLICATION_AGENT_TOKEN}`, "Content-Type": "application/json" };
  const endpoint = new URL(`/applications/${encodeURIComponent(data.applicationId)}`, url);
  const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ data, cv: cv.toString("base64"), letter: letter.toString("base64") }), signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Dedicated agent rejected the request (${response.status}). Review before retrying.`);
  for (let attempt = 0; attempt < 70; attempt++) {
    const poll = await fetch(endpoint, { headers, signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (!poll.ok) throw new Error("Could not reconnect to the application agent. Submission outcome is uncertain.");
    const job = await poll.json();
    if (job.result) return verifiedAgentResult(job.result);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  return { status: "needs_human", clicked: true, reason: "Dedicated agent is still processing or disconnected. Reconcile its saved result before retrying." };
}
