import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { ProductGrid } from "@/components/dashboard/product-grid";
import { ButtonLink } from "@/components/ui/button";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { products, type ProjectRow } from "@/lib/types";
import { formatKes } from "@/lib/utils";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const [{ data: profile }, { data: projects }, { data: payments }, { data: documents }] = await Promise.all([
    supabase.from("users").select("role").eq("id", user.id).single(),
    supabase.from("projects").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(10),
    supabase.from("payments").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("documents").select("id,project_id,title,updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(20)
  ]);
  const paidProjectIds = new Set((payments ?? []).filter((payment) => payment.status === "successful" || payment.status === "paid").map((payment) => payment.project_id));
  const paymentByProject = new Map((payments ?? []).map((payment) => [payment.project_id, payment]));

  return (
    <AppShell email={user.email} isAdmin={profile?.role === "admin"}>
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-4xl font-black">Dashboard</h1>
          <p className="mt-2 text-black/55 dark:text-white/55">Create, pay for, generate, and export your documents.</p>
        </div>
        <ButtonLink href="/dashboard/projects/new?product=cv_builder">New project</ButtonLink>
      </div>
      <ProductGrid />
      <section className="mt-8 grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-lg border border-black/10 dark:border-white/10">
          <div className="border-b border-black/10 p-5 dark:border-white/10">
            <h2 className="text-xl font-black">Project history</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="text-black/45 dark:text-white/45">
                <tr>
                  <th className="px-5 py-3 font-bold">Title</th>
                  <th className="px-5 py-3 font-bold">Product</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 font-bold">Updated</th>
                </tr>
              </thead>
              <tbody>
                {(projects as ProjectRow[] | null)?.length ? (
                  (projects as ProjectRow[]).map((project) => (
                    <tr key={project.id} className="border-t border-black/10 dark:border-white/10">
                      <td className="px-5 py-4 font-semibold">{project.title}</td>
                      <td className="px-5 py-4">{products[project.product].title}</td>
                      <td className="px-5 py-4">{project.status.replaceAll("_", " ")}</td>
                      <td className="px-5 py-4">{new Date(project.updated_at).toLocaleDateString()}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-5 py-8 text-black/55 dark:text-white/55" colSpan={4}>
                      No projects yet. Create your first document to begin.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div id="payments" className="rounded-lg border border-black/10 p-5 dark:border-white/10">
          <h2 className="text-xl font-black">Payments</h2>
          <div className="mt-5 space-y-3">
            {payments?.length ? (
              payments.map((payment) => (
                <div key={payment.id} className="rounded-lg border border-black/10 p-3 text-sm dark:border-white/10">
                  <div className="flex justify-between gap-3 font-bold">
                    <span>{payment.status}</span>
                    <span>{formatKes(payment.amount)}</span>
                  </div>
                  <div className="mt-1 text-black/50 dark:text-white/50">{payment.mpesa_receipt_number ?? payment.checkout_request_id}</div>
                  {payment.status === "successful" || payment.status === "paid" ? (
                    <ButtonLink className="mt-3 h-8 px-3" variant="secondary" href={`/api/receipts/download?paymentId=${payment.id}`}>
                      Receipt
                    </ButtonLink>
                  ) : payment.status === "failed" || payment.status === "cancelled" || payment.status === "timed_out" ? (
                    <ButtonLink className="mt-3 h-8 px-3" href={`/dashboard/checkout?projectId=${payment.project_id}&productId=${payment.product_id ?? payment.product}`}>
                      Retry
                    </ButtonLink>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm leading-6 text-black/55 dark:text-white/55">No payments recorded for this account.</p>
            )}
          </div>
        </div>
      </section>
      <section className="mt-8 rounded-lg border border-black/10 p-5 dark:border-white/10">
        <h2 className="text-xl font-black">Purchased Documents</h2>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-black/45 dark:text-white/45">
              <tr>
                <th className="py-3 font-bold">Document</th>
                <th className="py-3 font-bold">Payment</th>
                <th className="py-3 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents?.length ? (
                documents.map((document) => {
                  const payment = paymentByProject.get(document.project_id);
                  const paid = paidProjectIds.has(document.project_id);
                  return (
                    <tr key={document.id} className="border-t border-black/10 dark:border-white/10">
                      <td className="py-4 font-semibold">{document.title}</td>
                      <td className="py-4 capitalize">{payment?.status?.replace("_", " ") ?? "draft"}</td>
                      <td className="flex flex-wrap gap-2 py-4">
                        <ButtonLink className="h-8 px-3" variant="secondary" href={`/dashboard/projects/new?product=${payment?.product ?? "cv_builder"}`}>
                          Continue editing
                        </ButtonLink>
                        {paid ? (
                          <>
                            <ButtonLink className="h-8 px-3" href={`/api/documents/export?documentId=${document.id}&format=pdf`}>
                              PDF
                            </ButtonLink>
                            <ButtonLink className="h-8 px-3" href={`/api/documents/export?documentId=${document.id}&format=docx`}>
                              DOCX
                            </ButtonLink>
                            {payment?.id ? (
                              <ButtonLink className="h-8 px-3" variant="secondary" href={`/api/receipts/download?paymentId=${payment.id}`}>
                                Receipt
                              </ButtonLink>
                            ) : null}
                          </>
                        ) : payment && ["failed", "cancelled", "timed_out"].includes(payment.status) ? (
                          <ButtonLink className="h-8 px-3" href={`/dashboard/checkout?projectId=${document.project_id}&productId=${payment.product_id ?? payment.product}`}>
                            Retry payment
                          </ButtonLink>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="py-6 text-black/55 dark:text-white/55" colSpan={3}>
                    No documents have been created yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
