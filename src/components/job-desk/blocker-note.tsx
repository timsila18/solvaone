import { blockerAction } from "@/lib/job-desk/application-progress";

export function BlockerNote({ reason }: { reason?: string | null }) {
  const guidance = blockerAction(reason);
  return <div className="my-2 text-sm"><p className="font-semibold">{guidance.blocker}</p><p className="mt-1">Next action: {guidance.action}</p>{reason ? <details className="mt-2 text-xs"><summary>Original details</summary><p className="mt-1 whitespace-pre-wrap break-words">{reason}</p></details> : null}</div>;
}
