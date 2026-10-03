import { NextResponse } from "next/server";
import { runJobDeskWorker } from "@/lib/job-desk/worker";
import { enqueueTask } from "@/lib/job-desk/automation";
import { reconcileJobDeskPipeline } from "@/lib/job-desk/reconcile";
import { discoveryWindow } from "@/lib/job-desk/worker-lifecycle";
import { recoverUnderfilledSearches } from "@/lib/job-desk/search-recovery";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  const authorized = [process.env.CRON_SECRET, process.env.JOB_DESK_WORKER_SECRET]
    .some(secret => Boolean(secret) && authorization === `Bearer ${secret}`);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await reconcileJobDeskPipeline();
    const searchRecovery = await recoverUnderfilledSearches();
    await enqueueTask("schedule", `schedule:${discoveryWindow()}`, null);
    return NextResponse.json({ searchRecovery, processed: await runJobDeskWorker({ maxTasks: 50, maxRunMs: 240000 }) });
  }
  catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Worker unavailable" }, { status: 500 }); }
}
