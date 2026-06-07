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
  const [{ data: profile }, { data: projects }, { data: payments }] = await Promise.all([
    supabase.from("users").select("role").eq("id", user.id).single(),
    supabase.from("projects").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(10),
    supabase.from("payments").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5)
  ]);

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
                  <div className="mt-1 text-black/50 dark:text-white/50">{payment.provider_reference ?? payment.checkout_request_id}</div>
                </div>
              ))
            ) : (
              <p className="text-sm leading-6 text-black/55 dark:text-white/55">No payments recorded for this account.</p>
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
