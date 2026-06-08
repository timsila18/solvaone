import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const auth = await requireAdmin(user);
  if (!auth.allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "csv";
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("payments")
    .select("id,product,product_id,amount,currency,status,mpesa_receipt_number,receipt_number,created_at,paid_at")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const header = ["id", "product", "product_id", "amount", "currency", "status", "mpesa_receipt_number", "receipt_number", "created_at", "paid_at"];
  const csv = [
    header.join(","),
    ...rows.map((row) =>
      header
        .map((key) => `"${String((row as Record<string, unknown>)[key] ?? "").replaceAll('"', '""')}"`)
        .join(",")
    )
  ].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": format === "excel" ? "application/vnd.ms-excel" : "text/csv",
      "Content-Disposition": `attachment; filename="solvaone-revenue.${format === "excel" ? "xls" : "csv"}"`
    }
  });
}
