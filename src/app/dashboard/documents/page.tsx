import { ArrowRight, CheckCircle2, Download, FileText, Lock, ReceiptText } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { EmptyState } from "@/components/marketing/sections";
import { ButtonLink } from "@/components/ui/button";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { products, type ProductKey } from "@/lib/types";

type DocumentRecord = {
  id: string;
  project_id: string;
  title: string;
  html: string;
  updated_at: string;
  projects:
    | {
        id: string;
        product: ProductKey;
        status: string;
        title: string;
      }
    | {
        id: string;
        product: ProductKey;
        status: string;
        title: string;
      }[]
    | null;
};

type NormalizedDocumentRecord = Omit<DocumentRecord, "projects"> & {
  projects: {
    id: string;
    product: ProductKey;
    status: string;
    title: string;
  } | null;
};

type PaymentRecord = {
  id: string;
  project_id: string;
  product_id?: string | null;
  product?: ProductKey | null;
  status: string;
  amount: number;
  mpesa_receipt_number?: string | null;
};

function isPaid(status?: string | null) {
  return status === "successful" || status === "paid";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export default async function DocumentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const [{ data: profile }, { data: documents }, { data: payments }] = await Promise.all([
    supabase.from("users").select("role").eq("id", user.id).single(),
    supabase
      .from("documents")
      .select("id,project_id,title,html,updated_at,projects(id,product,status,title)")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase.from("payments").select("id,project_id,product_id,product,status,amount,mpesa_receipt_number").eq("user_id", user.id).order("created_at", { ascending: false })
  ]);

  const paymentByProject = new Map<string, PaymentRecord>();
  for (const payment of (payments ?? []) as PaymentRecord[]) {
    const existing = paymentByProject.get(payment.project_id);
    if (!existing || isPaid(payment.status)) paymentByProject.set(payment.project_id, payment);
  }

  const documentRows = ((documents ?? []) as unknown as DocumentRecord[]).map((document) => ({
    ...document,
    projects: Array.isArray(document.projects) ? document.projects[0] ?? null : document.projects
  })) as NormalizedDocumentRecord[];

  return (
    <AppShell email={user.email} isAdmin={profile?.role === "admin" || profile?.role === "super_admin"}>
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-4xl font-black">My Documents</h1>
          <p className="mt-2 text-black/55 dark:text-white/55">All your SolvaOne drafts, generated documents, downloads, and receipts in one place.</p>
        </div>
        <ButtonLink href="/dashboard/projects/new?product=cv_builder">
          <FileText className="h-4 w-4" /> Create new document
        </ButtonLink>
      </div>

      {documentRows.length ? (
        <div className="space-y-4">
          {documentRows.map((document) => {
            const project = document.projects;
            const payment = paymentByProject.get(document.project_id);
            const paid = isPaid(payment?.status);
            const product = project?.product;
            const productTitle = product ? products[product].title : "Document";
            const productId = payment?.product_id ?? payment?.product ?? product ?? "cv_builder";
            const hasGeneratedContent = document.html.replace(/<[^>]*>/g, "").trim().length > 20;

            return (
              <article key={document.id} className="rounded-lg border border-black/10 p-5 dark:border-white/10">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex h-8 items-center gap-2 rounded-lg bg-brand-blue px-3 text-xs font-black text-white">
                        <FileText className="h-4 w-4" /> {productTitle}
                      </span>
                      <span className="inline-flex h-8 items-center gap-2 rounded-lg border border-black/10 px-3 text-xs font-black capitalize dark:border-white/10">
                        {paid ? <CheckCircle2 className="h-4 w-4 text-brand-blue" /> : <Lock className="h-4 w-4" />}
                        {paid ? "Paid" : payment?.status?.replaceAll("_", " ") ?? "Draft"}
                      </span>
                      <span className="inline-flex h-8 items-center rounded-lg border border-black/10 px-3 text-xs font-bold dark:border-white/10">
                        {hasGeneratedContent ? "Generated" : "Needs generation"}
                      </span>
                    </div>
                    <h2 className="mt-4 text-2xl font-black">{document.title}</h2>
                    <p className="mt-1 text-sm text-black/50 dark:text-white/50">Updated {formatDate(document.updated_at)}</p>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {product ? (
                      <ButtonLink className="h-9 px-3" variant="secondary" href={`/dashboard/projects/new?product=${product}&projectId=${document.project_id}`}>
                        {hasGeneratedContent ? "Edit" : "Generate"} <ArrowRight className="h-4 w-4" />
                      </ButtonLink>
                    ) : null}
                    {paid ? (
                      <>
                        <ButtonLink className="h-9 px-3" href={`/api/documents/export?documentId=${document.id}&format=pdf`}>
                          <Download className="h-4 w-4" /> PDF
                        </ButtonLink>
                        <ButtonLink className="h-9 px-3" variant="secondary" href={`/api/documents/export?documentId=${document.id}&format=docx`}>
                          DOCX
                        </ButtonLink>
                        {payment?.id ? (
                          <ButtonLink className="h-9 px-3" variant="secondary" href={`/api/receipts/download?paymentId=${payment.id}`}>
                            <ReceiptText className="h-4 w-4" /> Receipt
                          </ButtonLink>
                        ) : null}
                      </>
                    ) : payment && ["failed", "cancelled", "timed_out"].includes(payment.status) ? (
                      <ButtonLink className="h-9 px-3" href={`/dashboard/checkout?projectId=${document.project_id}&productId=${productId}`}>
                        Retry payment
                      </ButtonLink>
                    ) : (
                      <ButtonLink className="h-9 px-3" href={`/dashboard/checkout?projectId=${document.project_id}&productId=${productId}`}>
                        Pay to unlock downloads
                      </ButtonLink>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState title="No documents yet" message="Create or revamp your first document and it will appear here." />
      )}
    </AppShell>
  );
}
