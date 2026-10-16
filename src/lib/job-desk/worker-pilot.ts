export function workerPilotOrders(value: string | undefined): string[] {
  const ids = [...new Set((value ?? "").split(",").map(id => id.trim()).filter(Boolean))];
  if (ids.length > 5 || ids.some(id => !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))) {
    throw new Error("Configure at most five valid order UUIDs for the worker pilot.");
  }
  return ids;
}

export function localPilotTask(taskType: string, orderId: string | null | undefined) {
  if (!orderId || !["prepare", "resume_assisted"].includes(taskType)) return false;
  return workerPilotOrders(process.env.JOB_DESK_WORKER_PILOT_ORDER_IDS).includes(orderId);
}
