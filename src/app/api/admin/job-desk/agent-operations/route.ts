import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/security";
import { agentOperationsSnapshot } from "@/lib/job-desk/agent-operations";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !(await requireAdmin(user)).allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { return NextResponse.json(await agentOperationsSnapshot()); }
  catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Agent operations are unavailable." }, { status: 500 }); }
}

