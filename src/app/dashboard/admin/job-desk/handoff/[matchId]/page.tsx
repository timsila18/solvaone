import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { BrowserHandoff } from "@/components/job-desk/browser-handoff";
import { getCurrentUser } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/security";

export default async function HandoffPage({ params }: { params: Promise<{ matchId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await requireAdmin(user)).allowed) redirect("/dashboard");
  const { matchId } = await params;
  return <AppShell email={user.email} isAdmin><main className="mx-auto max-w-6xl py-6"><Link href="/dashboard/admin/job-desk/review" className="text-sm font-semibold text-brand-blue">Needs your attention</Link><h1 className="mt-3 text-2xl font-bold">Application browser</h1><BrowserHandoff matchId={matchId} /></main></AppShell>;
}
