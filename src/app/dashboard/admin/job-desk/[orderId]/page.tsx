import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { JobDeskOrderActions } from "@/components/job-desk/order-actions";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { formatKes } from "@/lib/utils";

type Question = { id: string; category: string; question: string; reason: string; required?: boolean };

export default async function JobDeskOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = await createSupabaseServerClient();
  const { data: profile } = await db.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") redirect("/dashboard");
  const { orderId } = await params;

  const [{ data: order }, { data: files }, { data: document }, { data: questionnaire }, { data: aiRun }] = await Promise.all([
    db.from("job_desk_orders").select("*, client:job_desk_clients(*), profile:job_desk_candidate_profiles(*)").eq("id", orderId).single(),
    db.from("job_desk_intake_files").select("id,file_name,document_kind,extraction_status,extraction_warning,created_at").eq("order_id", orderId).order("created_at", { ascending: true }),
    db.from("job_desk_documents").select("id,title,html,status,version,structured_content,created_at").eq("order_id", orderId).eq("document_type", "revamped_cv").neq("status", "superseded").order("version", { ascending: false }).limit(1).maybeSingle(),
    db.from("job_desk_questionnaires").select("questions,status,responses").eq("order_id", orderId).maybeSingle(),
    db.from("job_desk_ai_runs").select("status,total_tokens,estimated_cost,error_message,created_at").eq("order_id", orderId).order("created_at", { ascending: false }).limit(1).maybeSingle()
  ]);
  if (!order) notFound();
  const client = Array.isArray(order.client) ? order.client[0] : order.client;
  const candidate = Array.isArray(order.profile) ? order.profile[0] : order.profile;
  const file = files?.find((item) => item.document_kind === "cv");
  const questions = (questionnaire?.questions ?? []) as Question[];

  return (
    <AppShell email={user.email} isAdmin>
      <div className="flex flex-col justify-between gap-5 border-b border-black/10 pb-6 dark:border-white/10 lg:flex-row lg:items-end">
        <div><a href="/dashboard/admin/job-desk" className="text-sm font-bold text-brand-blue">Job Desk / Orders</a><h1 className="mt-2 text-3xl font-black">{client?.full_name ?? "Client order"}</h1><p className="mt-2 text-sm text-black/55 dark:text-white/55">{order.service_type.replaceAll("_", " ")} · {client?.whatsapp_phone} · {order.status.replaceAll("_", " ")}</p></div>
        <JobDeskOrderActions key={order.status} orderId={orderId} canProcess={file?.extraction_status === "succeeded" && order.status !== "cv_processing"} canApprove={document?.status === "review"} currentStatus={order.status} paymentStatus={order.payment_status} />
      </div>

      <div className="grid gap-6 py-7 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <Panel title="Order"><Detail label="Payment" value={`${order.payment_status} · ${formatKes(order.amount)}`} /><Detail label="Reference" value={order.payment_reference || "Not recorded"} /><Detail label="Channel" value={order.source_channel} /><Detail label="Created" value={new Date(order.created_at).toLocaleString()} /></Panel>
          <Panel title="Preferences"><Detail label="Target roles" value={(candidate?.target_job_titles ?? []).join(", ") || "Not provided"} /><Detail label="Industries" value={(candidate?.preferred_industries ?? []).join(", ") || "Not provided"} /><Detail label="Locations" value={(candidate?.preferred_locations ?? []).join(", ") || "Not provided"} /><Detail label="Work arrangement" value={candidate?.remote_preference || "Flexible"} /><Detail label="Profile completeness" value={`${candidate?.completeness_score ?? 0}%`} /></Panel>
          <Panel title="Intake files">{files?.length ? files.map((item) => <div key={item.id} className="border-b border-black/10 pb-3 dark:border-white/10"><a className="break-all text-sm font-bold text-brand-blue" href={`/api/admin/job-desk/orders/${orderId}/files/${item.id}`}>{item.file_name}</a><Detail label="Type" value={item.document_kind} />{item.document_kind === "cv" ? <Detail label="Extraction" value={item.extraction_status} /> : null}{item.extraction_warning ? <p className="mt-2 text-xs leading-5 text-black/55 dark:text-white/55">{item.extraction_warning}</p> : null}</div>) : <p className="text-sm">No files uploaded.</p>}</Panel>
          <Panel title="Processing cost"><Detail label="Last run" value={aiRun?.status ?? "Not started"} /><Detail label="Tokens" value={Number(aiRun?.total_tokens ?? 0).toLocaleString()} /><Detail label="Estimated cost" value={`$${Number(aiRun?.estimated_cost ?? 0).toFixed(4)}`} />{aiRun?.error_message ? <p className="mt-3 text-xs font-semibold text-black dark:text-white">{aiRun.error_message}</p> : null}</Panel>
        </aside>

        <main className="min-w-0 space-y-7">
          <section><div className="flex items-end justify-between border-b border-black/10 pb-3 dark:border-white/10"><div><h2 className="text-xl font-black">Consolidated client questions</h2><p className="mt-1 text-sm text-black/50 dark:text-white/50">Ask once, then record all missing details together.</p></div><span className="text-sm font-bold text-brand-blue">{questions.length} questions</span></div>
            <div className="divide-y divide-black/10 dark:divide-white/10">{questions.length ? questions.map((item, index) => <div key={item.id} className="grid gap-2 py-4 md:grid-cols-[36px_1fr]"><div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-blue text-xs font-black text-white">{index + 1}</div><div><div className="text-xs font-black uppercase text-brand-blue">{item.category}</div><p className="mt-1 font-bold">{item.question}</p><p className="mt-1 text-sm text-black/50 dark:text-white/50">{item.reason}</p></div></div>) : <p className="py-8 text-sm text-black/50 dark:text-white/50">Process the CV to create one consolidated questionnaire.</p>}</div>
          </section>

          <section><div className="flex items-end justify-between border-b border-black/10 pb-3 dark:border-white/10"><div><h2 className="text-xl font-black">Approval-ready CV</h2><p className="mt-1 text-sm text-black/50 dark:text-white/50">Review every fact before approving or using it for applications.</p></div>{document ? <span className="text-sm font-bold text-brand-blue">Version {document.version} · {document.status}</span> : null}</div>
            {document?.html ? <article className="job-desk-cv mt-5 bg-white p-8 text-black shadow-soft" dangerouslySetInnerHTML={{ __html: document.html }} /> : <div className="mt-5 border border-dashed border-black/20 px-5 py-16 text-center dark:border-white/20"><p className="font-bold">No processed CV yet</p><p className="mt-2 text-sm text-black/50 dark:text-white/50">Use “Prepare CV and profile” after confirming the intake text is readable.</p></div>}
          </section>
        </main>
      </div>
    </AppShell>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="border-t-2 border-black pt-4 dark:border-white"><h2 className="text-sm font-black uppercase">{title}</h2><div className="mt-4 space-y-3">{children}</div></section>; }
function Detail({ label, value }: { label: string; value: string }) { return <div><div className="text-xs font-bold uppercase text-black/40 dark:text-white/40">{label}</div><div className="mt-1 break-words text-sm font-semibold capitalize">{value}</div></div>; }
