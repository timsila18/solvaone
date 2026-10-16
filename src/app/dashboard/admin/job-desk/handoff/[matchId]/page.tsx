import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { BrowserHandoff } from "@/components/job-desk/browser-handoff";
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/security";

export default async function HandoffPage({ params }: { params: Promise<{ matchId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await requireAdmin(user)).allowed) redirect("/dashboard");
  const { matchId } = await params;
  const db = await createSupabaseServerClient();
  const { data: match } = await db.from("job_desk_matches").select("vacancy:job_desk_vacancies(title,company_name)").eq("id", matchId).maybeSingle();
  const vacancy = Array.isArray(match?.vacancy) ? match.vacancy[0] : match?.vacancy;
  return <AppShell email={user.email} isAdmin><main className="mx-auto max-w-6xl py-6"><Link href="/dashboard/admin/job-desk/review" className="text-sm font-semibold text-brand-blue">Needs your attention</Link><h1 className="mt-3 break-words text-2xl font-bold">{vacancy?.title ?? "Application browser"}</h1>{vacancy?.company_name ? <p className="mt-1 font-semibold">{vacancy.company_name}</p> : null}<BrowserHandoff matchId={matchId} /></main></AppShell>;
}
