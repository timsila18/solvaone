"use client";

import { useEffect, useState } from "react";

type Snapshot = { agent: { ok: boolean; runtime: string }; activeOrders: number; zeroSubmissionOrders: number; underTargetOrders: number; failedTasks: number; queuedTasks: number; emailConfigured: boolean; dedicatedAgentConfigured: boolean; checkedAt: string };

export function AgentOperationsPanel() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/admin/job-desk/agent-operations", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Could not load operations.");
        if (active) { setSnapshot(body); setError(""); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Could not load operations."); }
    };
    load(); const timer = window.setInterval(load, 120000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  return <section className="border-b border-black/10 py-5 dark:border-white/10" aria-label="Agent operations">
    <h2 className="font-black">Delegated-agent operations</h2>
    <p className="mt-1 text-sm text-black/55 dark:text-white/55">Live health, queue pressure, delivery coverage and required delivery configuration.</p>
    {error ? <p role="status" className="mt-3 text-sm font-semibold">{error}</p> : null}
    {!snapshot && !error ? <p className="mt-3 text-sm">Checking agent operations...</p> : null}
    {snapshot ? <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4"><Metric label="Agent" value={snapshot.agent.ok ? snapshot.agent.runtime : "Unreachable"} /><Metric label="Orders below target" value={`${snapshot.underTargetOrders} of ${snapshot.activeOrders}`} /><Metric label="Zero submissions" value={String(snapshot.zeroSubmissionOrders)} /><Metric label="Queue / failed" value={`${snapshot.queuedTasks} / ${snapshot.failedTasks}`} /><Metric label="Email delivery" value={snapshot.emailConfigured ? "Configured" : "Missing configuration"} /><Metric label="Agent credentials" value={snapshot.dedicatedAgentConfigured ? "Configured" : "Missing configuration"} /><p className="text-xs text-black/45 dark:text-white/45">Checked {new Date(snapshot.checkedAt).toLocaleTimeString()}</p></div> : null}
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-bold uppercase text-black/45 dark:text-white/45">{label}</p><p className="mt-1 font-semibold">{value}</p></div>; }

