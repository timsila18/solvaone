import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { Page, Text, View, Document as PdfDocument, StyleSheet } from "@react-pdf/renderer";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { getPricingProduct } from "@/lib/pricing";
import { formatKes } from "@/lib/utils";

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 11, color: "#000000", lineHeight: 1.5 },
  brand: { color: "#0066FF", fontSize: 24, fontWeight: 700 },
  subtitle: { marginTop: 4, color: "#000000" },
  title: { marginTop: 36, fontSize: 18, fontWeight: 700 },
  row: { flexDirection: "row", justifyContent: "space-between", borderBottom: "1 solid #000000", paddingVertical: 8 },
  label: { color: "#000000" },
  value: { fontWeight: 700 }
});

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const paymentId = request.nextUrl.searchParams.get("paymentId");
  if (!paymentId) return NextResponse.json({ error: "Missing payment ID." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: payment } = await supabase
    .from("payments")
    .select("id,product_id,amount,currency,status,phone_number,mpesa_receipt_number,receipt_number,transaction_date,created_at")
    .eq("id", paymentId)
    .eq("user_id", user.id)
    .in("status", ["successful", "paid"])
    .single();

  if (!payment) return NextResponse.json({ error: "Receipt is only available for successful payments." }, { status: 404 });

  const product = getPricingProduct(payment.product_id) ?? { productName: payment.product_id };
  const receiptNumber = payment.receipt_number ?? `SOLVAONE-${new Date(payment.created_at).toISOString().slice(0, 10).replace(/-/g, "")}-${payment.id.slice(0, 4)}`;
  const rows = [
    ["Receipt Number", receiptNumber],
    ["Customer Email", user.email ?? "To be provided"],
    ["Customer Phone", payment.phone_number ?? "To be provided"],
    ["Product", product.productName],
    ["Amount Paid", formatKes(Number(payment.amount))],
    ["M-Pesa Receipt", payment.mpesa_receipt_number ?? "Manually verified"],
    ["Date/Time", new Date(payment.transaction_date ?? payment.created_at).toLocaleString("en-KE")],
    ["Payment Status", payment.status]
  ];

  const file = await renderToBuffer(
    <PdfDocument title={receiptNumber} author="SolvaOne">
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>SolvaOne</Text>
        <Text style={styles.subtitle}>Solva Business Group | Create. Apply. Grow.</Text>
        <Text style={styles.title}>Payment Receipt</Text>
        <View>
          {rows.map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.value}>{value}</Text>
            </View>
          ))}
        </View>
      </Page>
    </PdfDocument>
  );

  return new NextResponse(new Uint8Array(file), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${receiptNumber}.pdf"` }
  });
}
