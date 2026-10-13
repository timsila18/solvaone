type AgentTask = { task_type: string; status: string; created_at: string };

export function AgentPhase({ tasks, eligible }: { tasks: AgentTask[]; eligible: boolean }) {
  const searching = tasks.find(task => task.task_type === "match" && task.status === "running");
  const applying = tasks.find(task => task.task_type === "submit" && task.status === "running");
  const queuedSearch = tasks.find(task => task.task_type === "match" && task.status === "queued");
  const queuedApplication = tasks.find(task => task.task_type === "submit" && task.status === "queued");
  const active = applying ?? searching;
  const label = applying ? "Agent applying" : searching ? "Agent searching" : queuedApplication ? "Application queued" : queuedSearch ? "Search queued" : eligible ? "Search scheduled" : "Agent waiting";
  const detail = active ? "A worker is processing this order now." : queuedApplication || queuedSearch ? "The worker will pick up this task shortly." : eligible ? "The agent checks for eligible openings periodically." : "Approve the CV, verify payment and record application authorization to start.";

  return <div role="status" className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 border-l-4 border-brand-blue bg-brand-blue/5 px-4 py-3 text-sm">
    <span className="font-bold">{label}</span><span className="text-black/65 dark:text-white/65">{detail}</span>
  </div>;
}
