import { after, NextResponse } from "next/server";
import { handleDarajaCallback } from "@/lib/payments";
import { runJobDeskWorker } from "@/lib/job-desk/worker";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const result = await handleDarajaCallback(payload);
    if ("service" in result && result.service === "job_desk" && "status" in result && result.status === "successful") after(async () => {
      try { await runJobDeskWorker({ maxTasks: 2, maxRunMs: 240000 }); }
      catch { /* The scheduled worker retains queued tasks. */ }
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Callback handling failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
