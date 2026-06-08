import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { CheckoutPanel } from "@/components/dashboard/checkout-panel";
import { getPricingProduct, productIdToGenerationProduct, type ProductId } from "@/lib/pricing";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ projectId?: string; productId?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  if (!params.projectId || !params.productId) redirect("/dashboard");

  const product = getPricingProduct(params.productId);
  if (!product) redirect("/dashboard");

  const supabase = await createSupabaseServerClient();
  const [{ data: profile }, { data: project }] = await Promise.all([
    supabase.from("users").select("role").eq("id", user.id).single(),
    supabase.from("projects").select("id,product").eq("id", params.projectId).eq("user_id", user.id).single()
  ]);
  if (!project) redirect("/dashboard");
  if (productIdToGenerationProduct(product.productId) !== project.product && product.productId !== "cv_cover_bundle") redirect("/dashboard");

  return (
    <AppShell email={user.email} isAdmin={profile?.role === "admin" || profile?.role === "super_admin"}>
      <CheckoutPanel projectId={params.projectId} productId={product.productId as ProductId} />
    </AppShell>
  );
}
