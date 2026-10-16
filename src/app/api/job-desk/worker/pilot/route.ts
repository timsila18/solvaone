import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { workerPilotOrders } from "@/lib/job-desk/worker-pilot";
import { runJobDeskWorker } from "@/lib/job-desk/worker";
import { distinctSuccessfulDeliveries } from "@/lib/job-desk/application-progress";
import { hasVerifiedJobDeskPayment } from "@/lib/job-desk/payment";
import { enqueueTask } from "@/lib/job-desk/automation";
import { canRetrySubmission } from "@/lib/job-desk/submission-preflight";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.JOB_DESK_WORKER_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const ids = workerPilotOrders(process.env.JOB_DESK_WORKER_PILOT_ORDER_IDS);
    if (!ids.length) return NextResponse.json({ processed: 0, reason: "Pilot disabled; no approved order allowlist configured." });
    const db = createSupabaseAdminClient();
    const { data: orders, error } = await db.from("job_desk_orders")
      .select("id,payment_status,payment_reference,amount,application_authorized,status,created_at")
      .in("id", ids).eq("service_type", "job_search_full").eq("application_authorized", true)
      .in("status", ["approved", "active"]).order("created_at");
    if (error) throw error;
    const candidates = [];
    for (const order of orders ?? []) {
      if (!hasVerifiedJobDeskPayment(order)) continue;
      const { data: cv, error: cvError } = await db.from("job_desk_documents").select("status")
        .eq("order_id", order.id).eq("document_type", "revamped_cv").order("version", { ascending: false }).limit(1).maybeSingle();
      if (cvError) throw cvError;
      if (cv?.status !== "approved") continue;
      const { data: applications, error: applicationError } = await db.from("job_desk_applications")
        .select("match_id,status,method,provider_message_id,provider_response").eq("order_id", order.id).eq("status", "submitted").limit(1000);
      if (applicationError || applications?.length === 1000) throw new Error("Pilot progress could not be safely verified.");
      const submitted = distinctSuccessfulDeliveries(applications ?? []);
      if (submitted < 10) candidates.push({ id: order.id, submitted });
    }
    // Rotate equal-progress clients by time so a difficult order cannot monopolize the pilot.
    const rotation = Math.floor(Date.now() / 60000) % Math.max(1, candidates.length);
    const rotated = [...candidates.slice(rotation), ...candidates.slice(0, rotation)].sort((a, b) => a.submitted - b.submitted);
    let selected: { id: string; submitted: number } | undefined;
    for (const candidate of rotated) {
      const { data: matches, error: matchError } = await db.from("job_desk_matches")
        .select("id,status,reasons,application:job_desk_applications(status,provider_response)").eq("order_id", candidate.id).in("status", ["suggested", "ready", "authorized", "needs_human"])
        .order("created_at").limit(30);
      if (matchError) throw matchError;
      // Local preparation never invents suitability: only previously reviewed matches proceed.
      const reviewed = (matches ?? []).filter(match => {
        const application = Array.isArray(match.application) ? match.application[0] : match.application;
        return Array.isArray(match.reasons) && match.reasons.some((reason: string) => reason.startsWith("Suitability review:"))
          && (!application || canRetrySubmission(application)) && (match.status !== "needs_human" || Boolean(application));
      });
      for (const match of reviewed.slice(0, 3)) {
        const type = match.status === "authorized" ? "submit" : match.status === "needs_human" ? "resume_assisted" : "prepare";
        await enqueueTask(type, `local-pilot:${match.id}:${Math.floor(Date.now() / 3600000)}`, candidate.id, { matchId: match.id });
      }
      const { count, error: taskError } = await db.from("job_desk_tasks").select("id", { count: "exact", head: true })
        .eq("order_id", candidate.id).eq("status", "queued").lte("available_at", new Date().toISOString());
      if (taskError) throw taskError;
      if (count) { selected = candidate; break; }
    }
    const processed = selected ? await runJobDeskWorker({ orderId: selected.id, maxTasks: 1, maxRunMs: 240000 }) : 0;
    return NextResponse.json({ processed, eligible: candidates.length, target: 10 });
  } catch {
    return NextResponse.json({ error: "Pilot unavailable; no unrestricted worker fallback was started." }, { status: 503 });
  }
}
