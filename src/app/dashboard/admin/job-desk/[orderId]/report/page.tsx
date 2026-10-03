import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { buildApplicationReport, loadReportMatches } from "@/lib/job-desk/application-report";
import { ClientProgress } from "@/components/job-desk/client-progress";
import { AutomationControls } from "@/components/job-desk/automation-controls";
export default async function JobDeskReport({ params }: { params: Promise<{ orderId: string }> }) {
  const user = await getCurrentUser(); if (!user) redirect("/login");
  const db = await createSupabaseServerClient();
  const { data: account } = await db.from("users").select("role").eq("id", user.id).single();
  if (!account || !["admin", "super_admin"].includes(account.role)) redirect("/dashboard");
  const { orderId } = await params;
  const [{ data: order }, matches] = await Promise.all([db.from("job_desk_orders").select("id,status,client:job_desk_clients(full_name,email)").eq("id", orderId).single(), loadReportMatches(db, orderId)]);
  if (!order) notFound();
  const client = Array.isArray(order.client) ? order.client[0] : order.client;
  return <AppShell email={user.email} isAdmin>
    <Link href={`/dashboard/admin/job-desk/${orderId}`} className="text-sm font-bold text-brand-blue">Back to order</Link>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-3xl font-black">Application report</h1><p className="mt-2 text-sm">{client?.full_name} · {client?.email || "Add the client email before sending updates"}</p></div>
      <AutomationControls action="send_report" id={orderId} label="Email report to client" />
    </div>
    <div className="mt-6"><ClientProgress matches={matches} /></div>
    <pre className="mt-6 whitespace-pre-wrap break-words font-sans text-sm leading-7">{buildApplicationReport(matches)}</pre>
  </AppShell>;
}
