import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { EditorStudio } from "@/components/dashboard/editor-studio";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { products, type ProductKey } from "@/lib/types";

type DocumentContent = {
  brief?: string;
  payload?: Record<string, string>;
};

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ product?: string; projectId?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const product = (params.product ?? "cv_builder") as ProductKey;
  if (!products[product]) redirect("/dashboard");

  const supabase = await createSupabaseServerClient();
  const [{ data: profile }, projectResult] = await Promise.all([
    supabase.from("users").select("role").eq("id", user.id).single(),
    params.projectId
      ? supabase.from("projects").select("id,title,product,source_brief").eq("id", params.projectId).eq("user_id", user.id).single()
      : Promise.resolve({ data: null })
  ]);

  const project = projectResult.data;
  if (params.projectId && (!project || project.product !== product)) redirect("/dashboard");

  const { data: document } = project
    ? await supabase
        .from("documents")
        .select("id,title,content,html")
        .eq("project_id", project.id)
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const content = (document?.content ?? {}) as DocumentContent;

  return (
    <AppShell email={user.email} isAdmin={profile?.role === "admin" || profile?.role === "super_admin"}>
      <EditorStudio
        userId={user.id}
        productKey={product}
        initialProjectId={project?.id ?? null}
        initialDocumentId={document?.id ?? null}
        initialTitle={document?.title ?? project?.title ?? products[product].title}
        initialBrief={content.brief ?? project?.source_brief ?? ""}
        initialPayload={content.payload ?? {}}
        initialHtml={document?.html ?? ""}
      />
    </AppShell>
  );
}
