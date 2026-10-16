import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { applicationDeliveryCounts } from "@/lib/job-desk/application-progress";
import { sameOrderIdentity, type OrderIdentity } from "@/lib/job-desk/related-orders";

// Rendered only by the role-checked admin order page. Historical receipts stay
// on their original paid order; no copies, reassignment or inflated totals.
export async function RelatedOrderHistory({ orderId, client }: { orderId: string; client: OrderIdentity }) {
  if (!client.email?.trim()) return null;
  const db = await createSupabaseServerClient();
  const email = client.email.trim().replace(/[\\%_]/g, "\\$&");
  const { data: clients, error } = await db.from("job_desk_clients").select("id,full_name,email,whatsapp_phone").ilike("email", email).limit(100);
  if (error) return <p role="alert">Related order history could not load. Your current order is unchanged.</p>;
  const ids = (clients ?? []).filter(item => sameOrderIdentity(client, item)).map(item => item.id);
  if (!ids.length) return null;
  const { data: orders, error: ordersError } = await db.from("job_desk_orders").select("id,created_at,status,payment_status,service_type").in("client_id", ids).neq("id", orderId).order("created_at", { ascending: false }).limit(100);
  if (ordersError) return <p role="alert">Related order history could not load. Your current order is unchanged.</p>;
  if (!orders?.length) return null;
  const { data: applications, error: applicationError } = await db.from("job_desk_applications").select("order_id,match_id,status,method,provider_message_id,provider_response").in("order_id", orders.map(order => order.id)).limit(5000);
  return <section id="related-order-history" aria-label="Other orders for this client" className="border-b border-black/10 py-5 dark:border-white/10">
    <h2 className="text-lg font-black">Other Orders for This Client</h2>
    <p className="mt-2 text-sm">Earlier progress remains on the original order. These submissions are not added to this order's target.</p>
    {applicationError ? <p role="alert" className="mt-2 text-sm">Historical submission counts could not load. Open the original order to review its receipts.</p> : null}
    <ul className="mt-3 divide-y divide-black/10 dark:divide-white/10">{orders.map(order => {
      const counts = applicationDeliveryCounts((applications ?? []).filter(item => item.order_id === order.id));
      return <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
        <Link href={`/dashboard/admin/job-desk/${order.id}`} className="font-bold text-brand-blue">{new Date(order.created_at).toLocaleDateString("en-GB", { timeZone: "Africa/Nairobi" })} · {order.service_type.replaceAll("_", " ")} · {order.id.slice(0, 8)}</Link>
        <span>{order.payment_status} · {order.status.replaceAll("_", " ")}{!applicationError ? ` · ${counts.accepted + counts.delivered + counts.confirmed} submitted` : ""}</span>
      </li>;
    })}</ul>
  </section>;
}
