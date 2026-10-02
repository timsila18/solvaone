export function discoveryWindow(now = Date.now()) {
  return String(Math.floor(now / (2 * 3600000)));
}

export async function renewTaskLease(db: any, taskId: string, workerId: string) {
  const { error } = await db.from("job_desk_tasks")
    .update({ lease_until: new Date(Date.now() + 240000).toISOString() })
    .eq("id", taskId).eq("locked_by", workerId).eq("status", "running");
  if (error) throw new Error(error.message);
}
