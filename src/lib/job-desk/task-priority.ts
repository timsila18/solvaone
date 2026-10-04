import { successfulDelivery } from "./application-progress";

export const TASK_TIERS = [["submit", "resume_assisted", "prepare"], ["draft_answers", "review_matches"], ["process_cv", "match", "discover", "discover_email", "schedule", "notify_client"]] as const;
export function taskPriority(type: string) {
  const index = TASK_TIERS.findIndex(tier => (tier as readonly string[]).includes(type));
  return index === -1 ? 2 : index;
}

type QueuedTask = { order_id?: string | null; task_type: string; available_at: string; created_at: string; payload?: Record<string, unknown> };
export function compareClientTasks(a: QueuedTask, b: QueuedTask, successes: Map<string, number>) {
  const notification = (task: QueuedTask) => task.task_type === "notify_client" ? 0 : 1;
  const firstDelivery = (task: QueuedTask) => task.order_id && !successes.get(task.order_id) && ["match", "submit", "resume_assisted", "prepare"].includes(task.task_type) && task.payload?.assisted !== "true" ? 0 : 1;
  return notification(a) - notification(b)
    || firstDelivery(a) - firstDelivery(b)
    || taskPriority(a.task_type) - taskPriority(b.task_type)
    || Number(a.payload?.assisted === "true") - Number(b.payload?.assisted === "true")
    || a.available_at.localeCompare(b.available_at) || a.created_at.localeCompare(b.created_at);
}

// Compare-and-swap claims retain exclusivity across concurrent server workers.
export async function claimPrioritizedTask(db: any, workerId: string, fairnessTurn = false, orderId?: string) {
  const now = new Date().toISOString();
  const { data: expired, error: expiredError } = await db.from("job_desk_tasks").select("id,attempts,max_attempts,lease_until").eq("status", "running").lt("lease_until", now).limit(20);
  if (expiredError) throw new Error(expiredError.message);
  for (const task of expired ?? []) {
    const { error } = await db.from("job_desk_tasks").update({ status: task.attempts >= task.max_attempts ? "failed" : "queued", locked_at: null, locked_by: null, lease_until: null, available_at: new Date(Date.now() + 30000).toISOString(), last_error: "Worker lease expired; task returned to queue." }).eq("id", task.id).eq("status", "running").eq("lease_until", task.lease_until);
    if (error) throw new Error(error.message);
  }
  // A separate query finds updates even beyond the first 100 matching tasks.
  // One FIFO turn per six claims preserves progress for other task types.
  const tiers: (readonly string[] | null)[] = fairnessTurn ? [null] : [["notify_client"], null];
  for (const tier of tiers) {
    for (let contention = 0; contention < 4; contention++) {
      let query = db.from("job_desk_tasks").select("*").eq("status", "queued").lte("available_at", now).order("available_at").order("created_at").limit(100);
      if (orderId) query = query.eq("order_id", orderId);
      if (tier) query = query.in("task_type", tier);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      for (const exhausted of (data ?? []).filter((item: any) => item.attempts >= item.max_attempts)) {
        const { error: exhaustError } = await db.from("job_desk_tasks").update({ status: "failed", last_error: "Maximum task attempts reached." }).eq("id", exhausted.id).eq("status", "queued").eq("attempts", exhausted.attempts);
        if (exhaustError) throw new Error(exhaustError.message);
      }
      const successes = new Map<string, number>();
      const orderIds = [...new Set<string>((data ?? []).map((item: any) => item.order_id).filter(Boolean))];
      if (!fairnessTurn && orderIds.length) {
        const { data: applications, error: applicationError } = await db.from("job_desk_applications").select("order_id,status,method,provider_message_id,provider_response").in("order_id", orderIds).eq("status", "submitted").limit(1000);
        if (applicationError) throw new Error(applicationError.message);
        for (const application of applications ?? []) if (successfulDelivery(application)) successes.set(application.order_id, (successes.get(application.order_id) ?? 0) + 1);
      }
      const eligible = (data ?? []).filter((item: any) => item.attempts < item.max_attempts);
      if (!fairnessTurn) eligible.sort((a: any, b: any) => compareClientTasks(a, b, successes));
      const task = eligible[0];
      if (!task) { if (data?.length) continue; break; }
      const { data: claimed, error: claimError } = await db.from("job_desk_tasks").update({ status: "running", attempts: task.attempts + 1, locked_at: now, lease_until: new Date(Date.now() + 240000).toISOString(), locked_by: workerId }).eq("id", task.id).eq("status", "queued").eq("attempts", task.attempts).eq("available_at", task.available_at).select("*").maybeSingle();
      if (claimError) throw new Error(claimError.message);
      if (claimed) return claimed;
    }
  }
  return null;
}
