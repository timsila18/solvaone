import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { EditorStudio } from "@/components/dashboard/editor-studio";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { products, type ProductKey } from "@/lib/types";

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const product = (params.product ?? "cv_builder") as ProductKey;
  if (!products[product]) redirect("/dashboard");

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();

  return (
    <AppShell email={user.email} isAdmin={profile?.role === "admin" || profile?.role === "super_admin"}>
      <EditorStudio userId={user.id} productKey={product} />
    </AppShell>
  );
}
