import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { readAllRows, revenueLedger, summarizeRevenue, type RevenueRow, type RevenueOrder, type RevenueAttempt } from "@/lib/admin/revenue";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const auth = await requireAdmin(user);
  if (!auth.allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "csv";
  const supabase = await createSupabaseServerClient();
  let rows: RevenueRow[];
  try {
    const [payments, orders, attempts] = await Promise.all([
      readAllRows<RevenueRow>((from,to) => supabase.from("payments").select("id,product,product_id,amount,currency,status,mpesa_receipt_number,created_at,paid_at").order("id").range(from,to)),
      readAllRows<RevenueOrder>((from,to) => supabase.from("job_desk_orders").select("id,service_type,amount,payment_status,payment_reference,created_at,paid_at").order("id").range(from,to)),
      readAllRows<RevenueAttempt>((from,to) => supabase.from("job_desk_payment_attempts").select("id,order_id,amount,status,created_at,updated_at,mpesa_receipt_number").order("id").range(from,to))
    ]);
    rows = summarizeRevenue(revenueLedger(payments,orders,attempts), { range:url.searchParams.get("range") ?? "all", product:url.searchParams.get("product") ?? "all", status:url.searchParams.get("status") ?? "all" }).filtered;
  } catch {
    return NextResponse.json({error:"Revenue records could not be loaded."},{status:503});
  }
  const header = ["id", "product", "product_id", "amount", "currency", "status", "source", "mpesa_receipt_number", "created_at", "paid_at"];
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
