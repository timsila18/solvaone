import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProductKey } from "@/lib/types";

export const aiUsageLimits = {
  dailyCostUsd: 2,
  monthlyCostUsd: 20,
  dailyGenerations: 20,
  regenerationPerProject: 10
};

export async function assertAiUsageAllowed(userId: string, projectId: string) {
  const supabase = await createSupabaseServerClient();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1);

  const [{ data: daily }, { data: monthly }, { data: projectGenerations }] = await Promise.all([
    supabase.from("ai_generations").select("estimated_cost").eq("user_id", userId).gte("created_at", dayStart.toISOString()),
    supabase.from("ai_generations").select("estimated_cost").eq("user_id", userId).gte("created_at", monthStart.toISOString()),
    supabase.from("ai_generations").select("id").eq("user_id", userId).eq("project_id", projectId)
  ]);

  const dailyCost = (daily ?? []).reduce((sum, item) => sum + Number(item.estimated_cost ?? 0), 0);
  const monthlyCost = (monthly ?? []).reduce((sum, item) => sum + Number(item.estimated_cost ?? 0), 0);

  if ((daily ?? []).length >= aiUsageLimits.dailyGenerations) {
    throw new Error("Daily AI generation limit reached. Please try again tomorrow or contact support.");
  }
  if ((projectGenerations ?? []).length >= aiUsageLimits.regenerationPerProject) {
    throw new Error("Regeneration limit reached for this project. Please continue editing manually or contact support.");
  }
  if (dailyCost >= aiUsageLimits.dailyCostUsd) {
    throw new Error("Daily AI cost limit reached. Please try again later.");
  }
  if (monthlyCost >= aiUsageLimits.monthlyCostUsd) {
    throw new Error("Monthly AI cost limit reached. Please contact support.");
  }
}

export async function getAiSpendSummary() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("ai_generations")
    .select("user_id,product_type,estimated_cost,total_tokens,created_at,status")
    .order("created_at", { ascending: false })
    .limit(2000);

  const rows = data ?? [];
  const byProduct = rows.reduce(
    (acc, row) => {
      const key = row.product_type as ProductKey;
      acc[key] = (acc[key] ?? 0) + Number(row.estimated_cost ?? 0);
      return acc;
    },
    {} as Partial<Record<ProductKey, number>>
  );
  const byUser = rows.reduce(
    (acc, row) => {
      acc[row.user_id] = (acc[row.user_id] ?? 0) + Number(row.estimated_cost ?? 0);
      return acc;
    },
    {} as Record<string, number>
  );
  const total = rows.reduce((sum, row) => sum + Number(row.estimated_cost ?? 0), 0);
  const expensive = [...rows].sort((a, b) => Number(b.estimated_cost ?? 0) - Number(a.estimated_cost ?? 0)).slice(0, 10);

  return { total, byProduct, byUser, expensive };
}
