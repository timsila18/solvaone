import { NextResponse } from "next/server";
import { runJobDeskWorker } from "@/lib/job-desk/worker";
import { enqueueTask } from "@/lib/job-desk/automation";
import { reconcileJobDeskPipeline } from "@/lib/job-desk/reconcile";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { await reconcileJobDeskPipeline(); await enqueueTask("schedule", `schedule:${new Date().toISOString().slice(0, 10)}`, null); return NextResponse.json({ processed: await runJobDeskWorker({ maxTasks: 50, maxRunMs: 240000 }) }); }
  catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Worker unavailable" }, { status: 500 }); }
}
