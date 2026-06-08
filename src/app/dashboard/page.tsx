import { ArrowRight, CheckCircle2, Clock, CreditCard, Download, FileText, Gift, Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { EmptyState, DashboardMetricCard } from "@/components/marketing/sections";
import { ButtonLink } from "@/components/ui/button";
import { productPages, productUrl, site } from "@/lib/marketing";
import { pricingProducts } from "@/lib/pricing";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { products, type ProductKey, type ProjectRow } from "@/lib/types";
import { absoluteUrl, formatKes } from "@/lib/utils";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const [{ data: profile }, { data: projects }, { data: payments }, { data: documents }, { data: referrals }, { data: credits }] = await Promise.all([
    supabase.from("users").select("role,referral_code").eq("id", user.id).single(),
    supabase.from("projects").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(10),
    supabase.from("payments").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("documents").select("id,project_id,title,updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(20),
    supabase.from("referrals").select("id,status,reward_status").eq("referrer_user_id", user.id).limit(50),
    supabase.from("credits").select("id,status,credit_type,value").eq("user_id", user.id).eq("status", "active").limit(10)
  ]);

  const paidProjectIds = new Set((payments ?? []).filter((payment) => payment.status === "successful" || payment.status === "paid").map((payment) => payment.project_id));
  const paymentByProject = new Map((payments ?? []).map((payment) => [payment.project_id, payment]));
  const paidDocuments = (documents ?? []).filter((document) => paidProjectIds.has(document.project_id));
  const activeProject = (projects as ProjectRow[] | null)?.[0];
  const referralCode = profile?.referral_code ?? "PENDING";
  const referralLink = absoluteUrl(`/register?ref=${referralCode}`);

  return (
    <AppShell email={user.email} isAdmin={profile?.role === "admin" || profile?.role === "super_admin"}>
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-4xl font-black">Welcome to SolvaOne</h1>
          <p className="mt-2 text-black/55 dark:text-white/55">What do you want to create today?</p>
        </div>
        <ButtonLink href="/dashboard/projects/new?product=cv_builder">
          <Plus className="h-4 w-4" /> Create new document
        </ButtonLink>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardMetricCard label="Recent Projects" value={String(projects?.length ?? 0)} detail="Drafts and generated documents" />
        <DashboardMetricCard label="Purchased Documents" value={String(paidDocuments.length)} detail="Ready for downloads" />
        <DashboardMetricCard label="Active Credits" value={String(credits?.length ?? 0)} detail="Future wallet and referral rewards" />
        <DashboardMetricCard label="Referrals" value={String(referrals?.length ?? 0)} detail="Refer 3 paying users for 1 CV revamp credit" />
      </div>

      {activeProject ? (
        <section className="mt-6 rounded-lg border border-brand-blue p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <p className="text-xs font-black uppercase text-brand-blue">Continue where you left off</p>
              <h2 className="mt-2 text-2xl font-black">{activeProject.title}</h2>
              <p className="mt-1 text-sm font-semibold capitalize text-black/55 dark:text-white/55">{activeProject.status.replaceAll("_", " ")}</p>
            </div>
            <ButtonLink href={`/dashboard/projects/new?product=${activeProject.product}&projectId=${activeProject.id}`} variant="secondary">
              Continue editing <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          </div>
        </section>
      ) : null}

      <section className="mt-8">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black">Recommended products</h2>
            <p className="mt-1 text-sm text-black/55 dark:text-white/55">Pick the fastest path to your next application or business document.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {productPages.map((page) => (
            <div key={page.key} className="rounded-lg border border-black/10 p-5 dark:border-white/10">
              <h3 className="text-lg font-black">{pricingProducts[page.key].productName}</h3>
              <p className="mt-2 min-h-12 text-sm leading-6 text-black/55 dark:text-white/55">{page.headline}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <ButtonLink href={`/dashboard/projects/new?product=${page.key}`} className="h-9 px-3">Start</ButtonLink>
                <ButtonLink href={productUrl(page.key)} variant="secondary" className="h-9 px-3">Learn more</ButtonLink>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <WorkspacePanel title="Recent projects">
          {(projects as ProjectRow[] | null)?.length ? (
            <div className="space-y-3">
              {(projects as ProjectRow[]).map((project) => (
                <div key={project.id} className="flex flex-col justify-between gap-3 rounded-lg border border-black/10 p-4 dark:border-white/10 md:flex-row md:items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-brand-blue" />
                      <h3 className="font-black">{project.title}</h3>
                    </div>
                    <p className="mt-1 text-sm text-black/50 dark:text-white/50">{products[project.product].title} - {project.status.replaceAll("_", " ")}</p>
                  </div>
                  <ButtonLink className="h-8 px-3" variant="secondary" href={`/dashboard/projects/new?product=${project.product}&projectId=${project.id}`}>Continue</ButtonLink>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No projects yet" message="Create your first CV, cover letter, company profile, or business plan." />
          )}
        </WorkspacePanel>

        <WorkspacePanel title="Payments">
          {payments?.length ? (
            <div className="space-y-3">
              {payments.map((payment) => (
                <div key={payment.id} className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/10">
                  <div className="flex justify-between gap-3 font-black">
                    <span className="flex items-center gap-2 capitalize"><CreditCard className="h-4 w-4 text-brand-blue" />{payment.status.replaceAll("_", " ")}</span>
                    <span>{formatKes(payment.amount)}</span>
                  </div>
                  <p className="mt-1 truncate text-black/50 dark:text-white/50">{payment.mpesa_receipt_number ?? payment.checkout_request_id ?? "Awaiting M-Pesa confirmation"}</p>
                  {payment.status === "successful" || payment.status === "paid" ? (
                    <ButtonLink className="mt-3 h-8 px-3" variant="secondary" href={`/api/receipts/download?paymentId=${payment.id}`}>Receipt</ButtonLink>
                  ) : payment.status === "failed" || payment.status === "cancelled" || payment.status === "timed_out" ? (
                    <ButtonLink className="mt-3 h-8 px-3" href={`/dashboard/checkout?projectId=${payment.project_id}&productId=${payment.product_id ?? payment.product}`}>Retry</ButtonLink>
                  ) : (
                    <p className="mt-3 flex items-center gap-2 text-xs font-bold text-black/45 dark:text-white/45"><Clock className="h-4 w-4" /> Waiting for callback</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No payments yet" message="Payments appear here after checkout starts." />
          )}
        </WorkspacePanel>
      </section>

      <section className="mt-8 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <WorkspacePanel title="Purchased documents">
          {documents?.length ? (
            <div className="space-y-3">
              {documents.map((document) => {
                const payment = paymentByProject.get(document.project_id);
                const paid = paidProjectIds.has(document.project_id);
                return (
                  <div key={document.id} className="flex flex-col justify-between gap-3 rounded-lg border border-black/10 p-4 dark:border-white/10 lg:flex-row lg:items-center">
                    <div>
                      <h3 className="font-black">{document.title}</h3>
                      <p className="mt-1 text-sm capitalize text-black/50 dark:text-white/50">{payment?.status?.replaceAll("_", " ") ?? "draft"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {paid ? (
                        <>
                          <ButtonLink className="h-8 px-3" href={`/api/documents/export?documentId=${document.id}&format=pdf`}><Download className="h-4 w-4" /> PDF</ButtonLink>
                          <ButtonLink className="h-8 px-3" href={`/api/documents/export?documentId=${document.id}&format=docx`} variant="secondary">DOCX</ButtonLink>
                          {payment?.id ? <ButtonLink className="h-8 px-3" href={`/api/receipts/download?paymentId=${payment.id}`} variant="secondary">Receipt</ButtonLink> : null}
                        </>
                      ) : payment && ["failed", "cancelled", "timed_out"].includes(payment.status) ? (
                        <ButtonLink className="h-8 px-3" href={`/dashboard/checkout?projectId=${document.project_id}&productId=${payment.product_id ?? payment.product}`}>Retry payment</ButtonLink>
                      ) : (
                        <span className="inline-flex h-8 items-center gap-2 rounded-lg border border-black/10 px-3 text-xs font-bold dark:border-white/10">
                          <CheckCircle2 className="h-4 w-4 text-brand-blue" /> Draft saved
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No documents yet" message="Generated documents and downloads will appear here." />
          )}
        </WorkspacePanel>

        <WorkspacePanel title="Referral dashboard">
          <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
            <div className="flex items-center gap-2 text-sm font-black text-brand-blue"><Gift className="h-4 w-4" /> Referral reward</div>
            <p className="mt-3 text-sm leading-6 text-black/58 dark:text-white/58">Refer 3 paying users and get 1 free CV revamp credit when rewards are enabled by admin.</p>
            <div className="mt-4 rounded-lg bg-black p-3 text-xs font-semibold text-white">{referralLink}</div>
            <p className="mt-3 text-xs font-semibold text-black/45 dark:text-white/45">Code: {referralCode}</p>
          </div>
        </WorkspacePanel>
      </section>
    </AppShell>
  );
}

function WorkspacePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-black/10 p-5 dark:border-white/10">
      <h2 className="text-xl font-black">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}
